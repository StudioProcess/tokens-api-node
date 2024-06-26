import { readFileSync } from 'fs';
import got, { HTTPError } from 'got';
import { short_id, sleep, rnd, id_in, id_out, timestamp } from './util.mjs';

export const CONFIG = JSON.parse(readFileSync('./config/main.config.json'));
export const DB = JSON.parse(readFileSync(CONFIG.db_config));
export const COLORS = JSON.parse(readFileSync(CONFIG.colors_config));

export const colors = Object.values(COLORS);
export let color_idx = 0;


// design doc for interactions db
const interactions_design = {
  "views": {
    "queue_size": {
      "map": "function (doc) { if (doc.status == 'new' | doc.status == 'waiting') emit(); }",
      "reduce": "_count"
    },
    "waiting": {
      "map": "function(doc) { if (doc.status == 'waiting') emit(doc.deposited_at); }", // sort by deposition timestamp
    }
  },
  "language": "javascript"
};

/* 
  databases:
  tokens { _id, generated, keywords, svg, original_png }
  interactions { _id, color, status, queue_position, token_id }
  
  interaction status progression:
  incomplete -> new -> waiting -> done
  
  interaction lifecycle:
  request_interaction() -> status: "incomplete"
  deposit_interaction() -> status: "new"
  update_interaction()  -> status: "waiting" (queue_position changes)
  ...
  update_interaction()  -> status: "done" (queue_position 0, token_id available)
*/


// Note: Not defined async (no need, since it doesn't use await). Async removes cancel method from returned promise
export function request(method='get', path='', options={}) {
  let config_options = {};
  if (DB.request_options) config_options = DB.request_options;
  options = Object.assign({
    method,
    username: DB.user,
    password: DB.pass,
    responseType: 'json'
  }, config_options, options);
  return got(DB.url + path, options);
}

// Check if CouchDB is online
export async function check_dbms() {
  try {
    const res = await request('get', `/_up`);
    if (res.statusCode == 200) return true;
  } catch (e) { /* nop */ }
  return false;
}

// Check if neccessary databases exist
export async function check_dbs() {
  const promises = [ check_db(DB.tokens_db), check_db(DB.interactions_db) ];
  const results = await Promise.all(promises);
  return {
    [DB.tokens_db]: results[0],
    [DB.interactions_db]: results[1]
  }
}

export async function check_db(name) {
  try {
    const res = await request('head', `/${name}`);
    return res.statusCode == 200;
  } catch (e) {
    return false;
  }
}

export async function check_design_docs() {
  try {
    const res = await request('get', `/${DB.interactions_db}/_design/tfcc`);
    const ddoc = res.body;
    delete ddoc._id;
    delete ddoc._rev;
    return JSON.stringify(ddoc) == JSON.stringify(interactions_design);
  } catch (e) {
    if (e.response.statusCode == 404) return false;
    throw e;
  }
}

export async function check_uuid_alg() {
  try {
    const res = await request('get', '/_node/_local/_config/uuids/algorithm');
    const alg = res.body;
    return alg == 'utc_random';
  } catch (e) {
    if (e?.response.statusCode === 404) return false; // no uuids section or no algorithm defined at all
    throw e;
  }
}

export async function set_uuid_alg() {
    const res = await request('put', '/_node/_local/_config/uuids/algorithm', {
      json: 'utc_random'
    });
    return res.body;
}

export async function create_db(name) {
  const res = await request('put', `/${name}`);
  return res.body;
}

export async function delete_db(name) {
  const res = await request('delete', `/${name}`);
  return res.body;
}

export async function all_dbs(name) {
  const res = await request('get', `/_all_dbs`);
  return res.body;
}

export async function create_design_docs() {
  // get revision (in case design doc already exists)
  let rev;
  try {
    const res = await request('get', `/${DB.interactions_db}/_design/tfcc`);
    rev = res.body._rev;
  } catch (e) { /* nop */ }
  
  const res = request('post', `/${DB.interactions_db}`, {
    json: Object.assign({
      _id: "_design/tfcc",
      _rev: rev,
    }, interactions_design)
  });
  return res.body;
}

export async function get_uuids(n=1) {
  const res = await request('get', '/_uuids', {
    searchParams: { 'count': n }
  });
  return res.body;
}


// Returns: { id }
export async function put_token(token, max_retries = 10) {
  token = Object.assign( {}, token ); // copy token
  
  let retries = 0;
  while (true) {
    try {
      token._id = short_id(); // add id
      const res = await request('post', `/${DB.tokens_db}`, {json: token}); // seems to take >= 2ms, so it's fine for id generation, if the client is waiting
      // res.body: { ok: true, id: '', rev: '' }
      return { id: id_out(res.body.id) };
    } catch (e) {
      // 409 Conflict: A Conflicting Document with same ID already exists
      if (e instanceof HTTPError && e.response.statusCode == 409 && retries < max_retries) {
        retries++;
        await sleep( rnd(1,100*retries) ); // limit token generation rate (ensures next id is unique)
        continue; // try again
      } else throw e;
    }
  }
}

// Returns: ''
export async function delete_token(id) {
  id = id_in(id);
  const res = await request('get', `/${DB.tokens_db}/${id}`);
  const res1 = await request('delete', `/${DB.tokens_db}/${id}`, {
    searchParams: { rev: res.body._rev }
  });
  // res1.body: { ok: true }
  return '';
}

// Returns: { id, generated, svg , ... }
export async function get_single_token(id) {
  id = id_in(id);
  const res = await request('get', `/${DB.tokens_db}/${id}`);
  // res.body: { _id: '', _rev: '', token data ... }
  res.body.id = id_out(res.body._id);
  delete res.body._id;
  delete res.body._rev;
  return res.body;
}

async function get_tokens_offset(offset=0, count=1, newest_first=true) {
  if (offset >= 0) {
    return get_tokens_offset_pos(offset, count, newest_first);
  } else {
    return get_tokens_offset_neg(offset, count, newest_first)
  }
}

async function get_tokens_offset_pos(offset=0, count=1, newest_first=true) {
  if (offset < 0) throw {'error': 'offset out of range'};
  
  const searchParams = {
    'include_docs': true,
    'skip': offset > 0 ? offset-1 : 0,
    'limit': offset > 0 ? count + 2 : count + 1,
    'descending': false,
  };
  if (newest_first) searchParams.descending = !searchParams.descending;
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  // if (offset >= res.body.total_rows) throw {'error': 'offset out of range'};
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = id_out(row.doc._id);
    delete row.doc._id;
    delete row.doc._rev;
    return row.doc;
  });
  body.offset = offset;
  body.newest_first = newest_first;
  
  if ( offset > 0 && body.rows.length > 0 ) {
    const first = body.rows.shift();
    body.prev = first.id;
  } else {
    body.prev = null;
  }
  
  if (body.rows.length > count) {
    const last = body.rows.pop();
    body.next = last.id;
  } else {
    body.next = null;
  }
  
  return body;
}

async function get_tokens_offset_neg(offset=-1, count=1, newest_first=true) {
  if (offset >= 0) throw {'error': 'offset out of range'};
  //    idx:   0   1   2   3   4
  // offset:  -5  -4  -3  -2  -1

  offset = -offset - 1; // make a zero based index (from the end): -1 -> 0, -2 -> 1, -3 -> 2, ...
  count = Math.min(count, offset + 1); // limit count to available size at the end
  const searchParams = {
    'include_docs': true,
    'skip': offset-count <= 0 ? 0 : offset-count,
    'limit': offset-count >= 0 ? count+2 : count+1,
    'descending': true,
  };
  if (newest_first) searchParams.descending = !searchParams.descending;
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = id_out(row.doc._id);
    delete row.doc._id;
    delete row.doc._rev;
    return row.doc;
  });
  
  body.newest_first = newest_first;
  body.rows.reverse();
  body.offset = -offset-1; // provide original negative offset
  
  // needs to be done first
  if ( offset-count+1 > 0 && body.rows.length > 0 ) {
    const last = body.rows.pop();
    body.next = last.id;
  } else {
    body.next = null;
  }
  
  if ( body.rows.length > count ) {
    const first = body.rows.shift();
    body.prev = first.id;
  } else {
    body.prev = null;
  }
  
  return body;
}

async function get_tokens_from_id(start_id, count=1, newest_first=true) {
  start_id = id_in(start_id);
  // get start_key for descending true or false
  // when searching backwards (descending), make sure we have a high key (but not higher than the next valid one)
  // this ensures a partial start_key will work as well
  const start_key = {
    true:  `"${start_id}\ufff0"`, // start_key when direction is descending
    false: `"${start_id}"`,       // start_key when direction is acending
  };
  
  const searchParams = {
    'include_docs': true,
    'limit': count + 1,
    'descending': newest_first,
    'start_key': start_key[newest_first]
  };
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = id_out(row.doc._id);
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
    searchParams.start_key = start_key[searchParams.descending];
    const res_prev = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
    res_prev.body.rows = res_prev.body.rows.map(row => row.doc);
    body.prev = id_out(res_prev.body.rows[1]._id);
  } else {
    body.prev = null;
  }
  
  return body;
}

async function get_tokens_until_id(end_id, count=1, newest_first=true) {
  end_id = id_in(end_id);
  // get start_key for descending true or false
  // when searching backwards (descending), make sure we have a high key (but not higher than the next valid one)
  // this ensures a partial start_key will work as well
  const start_key = {
    true:  `"${end_id}\ufff0"`, // start_key when direction is descending
    false: `"${end_id}"`,       // start_key when direction is acending
  };
  
  const searchParams = {
    'include_docs': true,
    'limit': count + 1,
    'descending': !newest_first,
    'start_key': start_key[!newest_first]
  };
  
  const res = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
  
  const body = res.body;
  body.rows = body.rows.map(row => {
    row.doc.id = id_out(row.doc._id);
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
    searchParams.start_key = start_key[searchParams.descending];
    const res_next = await request('get', `/${DB.tokens_db}/_all_docs`, {searchParams});
    res_next.body.rows = res_next.body.rows.map(row => row.doc);
    body.next = id_out(res_next.body.rows[1]._id);
  } else {
    body.next = null;
  }
  
  body.offset = body.total_rows - body.offset - body.rows.length;
  return body;
}

// Returns: { total_rows, offset, rows: [ {id, ..}, ..], newest_first, prev, next }
export async function get_tokens(offset=null, start_id=null, end_id=null, count=1, newest_first=true) {
  if (offset != null) {
    return get_tokens_offset(offset, count, newest_first);
  }
  
  if (start_id != null) {
    return get_tokens_from_id(start_id, count, newest_first);
  }
  
  if (end_id != null) {
    return get_tokens_until_id(end_id, count, newest_first);
  }
  
  throw { error: 'need offset, start_id, or end_id' };
}



// Returns: { id, color }
export async function request_interaction() {
  const color = colors[color_idx];
  color_idx = (color_idx + 1) % colors.length;
  
  const ts = timestamp();
  
  const res = await request('post', `/${DB.interactions_db}`, {
    json: { 
      'status': 'incomplete',
      'requested_at': ts,
      'color': color,
    }
  });

  return {
    id: res.body.id,
    color,
    requested_at: ts, 
  };
}

// Returns: true|false
export async function check_token(id) {
  id = id_in(id);
  try {
    const res = await request('head', `/${DB.tokens_db}/${id}`);
    return res.statusCode == 200;
  } catch (e) {
    if (e.response.statusCode == 404) return false;
    throw e;
  }
}

// Returns: true|false
export async function check_interaction(id) {
  try {
    const res = await request('head', `/${DB.interactions_db}/${id}`);
    return res.statusCode == 200;
  } catch (e) {
    if (e.response.statusCode == 404) return false;
    throw e;
  }
}

// Returns: size
export async function interaction_queue_size() {
  const res = await request('get', `/${DB.interactions_db}/_design/tfcc/_view/queue_size`);
  const rows = res.body.rows;
  if (rows.length == 0) return 0;
  return rows[0].value;
}

// Returns: ''
export async function deposit_interaction(id, keywords) {
  let res;
  try {
    res = await request('get', `/${DB.interactions_db}/${id}`);
  } catch (e) {
    if (e.response.statusCode == 404) throw {error: 'not found'};
    throw e;
  }
  let int = res.body;
  if (int.status != 'incomplete') {
    throw { error: 'already deposited' };
  }
  const age_secs = (Date.now() - Date.parse(int.requested_at)) / 1000; // age in seconds
  if (age_secs > CONFIG.deposit_max_age) {
    throw { error: 'expired' };
  }
  int.status = 'new';
  int.keywords = keywords;
  int.deposited_at = timestamp();
  res = await request('post', `/${DB.interactions_db}`, {json: int});
  return '';
}

// Returns: { id, seq, queue_position, token_id? }
export async function get_single_interaction_updates(id, since=0, timeout=60000) {
  const res = await request('post', `/${DB.interactions_db}/_changes`, {
    searchParams: {
      feed: 'longpoll',
      filter: '_selector',
      include_docs: true,
      since,
      timeout
    },
    json: {
      'selector': {
        '_id': id,
        '$or': [{ 'status': 'waiting' }, { 'status': 'done' }]
      }
    }
  });
  // the request will return after 60 seconds (max) with empty results
  if (res.body.results.length == 0) throw {error: 'timeout'};
  // use the last available result
  const result = res.body.results[res.body.results.length-1];
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
    int.token_id = id_out(token_id);
    int.status = 'done';
  } else {
    int.queue_position = queue_position;
    int.status = 'waiting';
  }
  res = await request('post', `/${DB.interactions_db}`, {json: int});
  return '';
}

// Returns: { id, seq, color, keywords }
export async function get_new_interaction_updates(since=0, timeout=60000) {  
  const res = await request('post', `/${DB.interactions_db}/_changes`, {
    searchParams: {
      feed: 'longpoll',
      filter: '_selector',
      include_docs: true,
      since,
      timeout
    },
    json: {
      'selector': { 'status': 'new' }
    }
  });
  // the request will return after 60 seconds (max) with empty results
  if (res.body.results.length == 0) throw {error: 'timeout'};
  // return first result only, even though there may be more. the next result will be retrieved by using the sequence number
  const result = res.body.results[0]; 
  const doc = result.doc;
  return {
    id: doc._id,
    seq: result.seq,
    color: doc.color,
    keywords: doc.keywords,
    requested_at: doc.requested_at,
    deposited_at: doc.deposited_at,
  };
}

// Returns: [ {id, color, keywords, requested_at, deposited_at}, ... ] 
export async function get_waiting_interactions(since = null) {
  if (since) {
    since = Date.parse(since);
    if (Number.isNaN(since)) {
      throw { 'error': 'invalid timestamp' };
    }
    since = (new Date(since)).toISOString();
  } else {
    since = '0';
  }
  const res = await request('get', `/${DB.interactions_db}/_design/tfcc/_view/waiting`, {
    searchParams: {
      include_docs: true,
      start_key: `"${since}"`,
    }
  });
  let rows = res.body.rows.map(x => {
    return {
      id: x.doc._id,
      color: x.doc.color,
      keywords: x.doc.keywords,
      requested_at: x.doc.requested_at,
      deposited_at: x.doc.deposited_at,
    };
  });
  return rows;
}
