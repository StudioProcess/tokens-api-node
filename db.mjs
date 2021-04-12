import { readFileSync } from 'fs';
import got from 'got';

export const DB = JSON.parse(readFileSync('./db.config.json'));
export const COLORS = JSON.parse(readFileSync('./colors.config.json'));

const colors = Object.values(COLORS);
let color_idx = 0;

/* 
  databases:
  tokens { _id, generated, keywords, svg, original_png }
  interactions { _id, color, status, queue_position, token_id }
  
  interaction status progression:
  incomplete -> new -> waiting -> done
*/

export async function request(method='get', path='', options={}) {
  options = Object.assign({
    method,
    username: DB.user,
    password: DB.pass,
    responseType: 'json'
  }, options);
  return got(DB.url + path, options);
}

export async function create_db(name) {
  const res = request('put', `/${name}`);
  return res.body;
}

export async function delete_db(name) {
  const res = request('delete', `/${name}`);
  return res.body;
}

export async function create_filters(db_name) {
  const res = request('post', `/${DB.interactions_db}`, {
    json: {
      _id: "_design/filters",
      filters: {
        "new": "function(doc, req) { return doc.status == 'new'; }",
        "updates": "function(doc, req) { return doc._id == req.query.doc_id && (doc.status == 'waiting' || doc.status == 'done'); }"
      }
    }
  });
  return res.body;
}

export async function get_uuids(n=1) {
  const res = await request('get', '/_uuids', {
    searchParams: { 'count': n }
  });
  return res.body;
}


// Returns: { id: '' }
export async function put_token(token) {
  const res = await request('post', `/${DB.tokens_db}`, {json: token});
  // res.body: { ok: true, id: '', rev: '' }
  return { id: res.body.id };
}

// Returns: ''
export async function delete_token(id) {
  const res = await request('get', `/${DB.tokens_db}/${id}`);
  const res1 = await request('delete', `/${DB.tokens_db}/${id}`, {
    searchParams: { rev: res.body._rev }
  });
  // res1.body: { ok: true }
  return '';
}

// Returns: { id, generated, svg }
export async function get_single_token(id) {
  const res = await request('get', `/${DB.tokens_db}/${id}`);
  // res.body: { _id: '', _rev: '', token data ... }
  return {
    id: res.body._id,
    svg: res.body.svg,
    generated: res.body.generated
  };
}

async function get_tokens_offset(offset=0, count=2, newest_first=true) {
  if (offset < 0) offset = -1;
  
  const searchParams = {
    'include_docs': true,
    'skip': offset > 0 ? offset-1 : 0,
    'limit': offset > 0 ? count + 2 : count + 1,
    'descending': offset == -1,
  };
  if (newest_first) {
    searchParams.descending = !searchParams.descending;
  }
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = row.doc._id;
    delete row.doc._id;
    delete row.doc._rev;
    return row.doc;
  });
  body.offset = offset;
  body.newest_first = newest_first;
  
  if (offset < 0) {
    body.rows.reverse();
    body.offset = body.total_rows - body.rows.length + 1;
  }
  
  if (offset > 0 || offset == -1) {
    const first = body.rows.shift();
    body.prev = first.id;
  } else {
    body.prev = null;
  }
  
  if (body.rows.length > count) {
    const last = body.rows.pop()
    body.next = last.id;
  } else {
    body.next = null;
  }
  
  return body;
  
  // TODO: throw error when offset >= total_rows
}

async function get_tokens_from_id(start_id, count=2, newest_first=true) {
  const searchParams = {
    'include_docs': true,
    'limit': count + 1,
    'descending': newest_first,
    'start_key': `"${start_id}"`
  };
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = row.doc._id;
    delete row.doc._id;
    delete row.doc._rev;
    return row.doc;
  });
  body.newest_first = newest_first;
  
  if (body.rows.length > count) {
    const last = body.rows.pop()
    body.next = last.id;
  } else {
    body.next = null;
  }
  
  // get previous (needs new request)
  if (body.offset > 0) {
    searchParams.limit = 2;
    searchParams.descending = !searchParams.descending;
    const res_prev = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
    res_prev.body.rows = res_prev.body.rows.map(row => row.doc);
    body.prev = res_prev.body.rows[1]._id;
  } else {
    body.prev = null;
  }
  
  return body;
}

async function get_tokens_until_id(end_id, count=2, newest_first=true) {
  const searchParams = {
    'include_docs': true,
    'limit': count + 1,
    'descending': !newest_first,
    'start_key': `"${end_id}"`
  };
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = row.doc._id;
    delete row.doc._id;
    delete row.doc._rev;
    return row.doc;
  });
  body.newest_first = newest_first;
  body.rows.reverse();
  
  if (body.rows.length > count) {
    const first = body.rows.shift();
    body.prev = first.id;
  } else {
    body.prev = null;
  }
  
  // get next (needs new request)
  if (body.offset > 0) {
    searchParams.limit = 2;
    searchParams.descending = !searchParams.descending;
    const res_next = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
    res_next.body.rows = res_next.body.rows.map(row => row.doc);
    body.next = res_next.body.rows[1]._id;
  } else {
    body.next = null;
  }
  
  body.offset = body.total_rows - body.offset - body.rows.length;
  return body;
}

// Returns: { total_rows, offset, rows: [ {id, ..}, ..], newest_first, prev, next }
export async function get_tokens(offset=0, start_id=null, end_id=null, count=2, newest_first=true) {
  if (offset != null) {
    return get_tokens_offset(offset, count, newest_first);
  }
  
  if (start_id != null) {
    return get_tokens_from_id(start_id, count, newest_first);
  }
  
  if (end_id != null) {
    return get_tokens_until_id(end_id, count, newest_first);
  }
  
  // TODO: error now
}



// Returns: { id, color }
export async function request_interaction() {
  color_idx = (color_idx++) % colors.length
  const color = colors[color_idx];
  
  const res = await request('post', `/${DB.interactions_db}`, {
    json: { 
      'status': 'incomplete',
      'color': color,
    }
  });

  return {
    id: res.body.id,
    color,
  };
}

// Returns: ''
export async function deposit_interaction(id, keywords) {
  let res = await request('get', `/${DB.interactions_db}/${id}`);
  let int = res.body;
  int.status = 'new';
  int.keywords = keywords;
  res = await request('post', `/${DB.interactions_db}`, {json: int});
  return '';
}

// Returns: { id, seq, queue_position, token_id? }
export async function get_single_interaction_updates(id, since=0) {
  const res = await request('get', `/${DB.interactions_db}/_changes`, {
    searchParams: {
      feed: 'longpoll',
      filter: 'filters/updates',
      doc_id: id,
      include_docs: true,
      since,
    }
  });
  const result = res.body.results[0];
  const doc = result.doc;
  return {
    id: doc._id,
    seq: result.seq,
    queue_position: doc.queue_position,
    token_id: doc.token_id ?? null,
  };
}

// Returns: ''
export async function update_interaction(id, queue_position, token_id=null) {
  let res = await request('get', `/${DB.interactions_db}/${id}`);
  let int = res.body;
  if (token_id != null) {
    int.queue_position = 0;
    int.token_id = token_id;
    int.status = 'done';
  } else {
    int.queue_position = queue_position;
    int.status = 'waiting';
  }
  res = await request('post', `/${DB.interactions_db}`, {json: int});
  return '';
}

// Returns: { id, color, keywords }
export async function get_new_interaction_updates(since=0) {
  const res = await request('get', `/${DB.interactions_db}/_changes`, {
    searchParams: {
      feed: 'longpoll',
      filter: 'filters/new',
      include_docs: true,
      since,
    }
  });
  const doc = res.body.results[0].doc;
  return {
    id: doc._id,
    color: doc.color,
    keywords: doc.keywords
  };
}
