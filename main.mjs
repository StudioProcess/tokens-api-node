import got from 'got';

const DB = {
  'URL': 'http://localhost:5984',
  'USER': 'admin2',
  'PASS': 'symbolic_unicorn',
}

function rnd(min, max) {
  if (max == undefined) {
    if (min == undefined) {
      min = 0;
      max = 1;
    } else {
      // use value given as max
      max = min;
      min = 0;
    }
  }
  return min + Math.random() * (max-min);
}

function random_svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" style="stroke:black; stroke-width:10; fill:none;">
  <circle cx="${rnd(1000)}" cy="${rnd(1000)}" r="${rnd(1000/3, 1000)}"/>
  <line x1="${rnd(1000)}" y1="${rnd(1000)}" x2="${rnd(1000)}" y2="${rnd(1000)}"/>
  <line x1="${rnd(1000)}" y1="${rnd(1000)}" x2="${rnd(1000)}" y2="${rnd(1000)}"/>
</svg>`;
}

// token { _id, generated, keywords, svg, original_png }
// interaction { _id, color, completed?, queue_position, token }

async function put_token(token) {
  const res = await got.post(`${DB.URL}/tokens`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
    json: token,
  });
  return res.body; // { ok: true, id: '', rev: '' }
}

async function get_single_token(id) {
  const res = await got.get(`${DB.URL}/tokens/${id}`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
  });
  return res.body; // { _id: '', _rev: '', token data }
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
  
  const res = await got.get(`${DB.URL}/tokens/_all_docs`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
    searchParams,
  });
  
  const body = res.body;
  body.rows = body.rows.map(row => row.doc);
  body.offset = offset;
  body.newest_first = newest_first;
  
  if (offset < 0) {
    body.rows.reverse();
    body.offset = body.total_rows - body.rows.length + 1;
  }
  
  if (offset > 0 || offset == -1) {
    const first = body.rows.shift();
    body.prev = first;
  } else {
    body.prev = null;
  }
  
  if (body.rows.length > count) {
    const last = body.rows.pop()
    body.next = last;
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
  
  const res = await got.get(`${DB.URL}/tokens/_all_docs`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
    searchParams
  });
  
  const body = res.body;
  body.rows = body.rows.map(row => row.doc);
  body.newest_first = newest_first;
  
  if (body.rows.length > count) {
    const last = body.rows.pop()
    body.next = last;
  } else {
    body.next = null;
  }
  
  // get previous (needs new request)
  if (body.offset > 0) {
    searchParams.limit = 2;
    searchParams.descending = !searchParams.descending;
    const res_prev = await got.get(`${DB.URL}/tokens/_all_docs`, {
      username: DB.USER,
      password: DB.PASS,
      responseType: 'json',
      searchParams
    });
    res_prev.body.rows = res_prev.body.rows.map(row => row.doc);
    body.prev = res_prev.body.rows[1];
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
  
  const res = await got.get(`${DB.URL}/tokens/_all_docs`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
    searchParams
  });
  
  const body = res.body;
  body.rows = body.rows.map(row => row.doc);
  body.newest_first = newest_first;
  body.rows.reverse();
  
  if (body.rows.length > count) {
    const first = body.rows.shift();
    body.prev = first;
  } else {
    body.prev = null;
  }
  
  // get next (needs new request)
  if (body.offset > 0) {
    searchParams.limit = 2;
    searchParams.descending = !searchParams.descending;
    const res_next = await got.get(`${DB.URL}/tokens/_all_docs`, {
      username: DB.USER,
      password: DB.PASS,
      responseType: 'json',
      searchParams
    });
    res_next.body.rows = res_next.body.rows.map(row => row.doc);
    body.next = res_next.body.rows[1];
  } else {
    body.next = null;
  }
  
  body.offset = body.total_rows - body.offset - body.rows.length;
  return body;
}

async function get_tokens(offset=0, start_id=null, end_id=null, count=2, newest_first=true) {
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

async function get_uuids(n=1) {
  const res = await got.get(`${DB.URL}/_uuids`, {
    username: DB.USER,
    password: DB.PASS,
    responseType: 'json',
    searchParams: {
      'count': n,
    },
  });
  return res.body;
}


(async () => {
  // const res = await put_token({ generated: (new Date()).toISOString() });
  // console.log(res);
  
  // const res = await get_single_token('4fbef087b199fd3ebf23aa1634000fc1');
  // console.log(res);
  
  // const res = await get_uuids(1000);
  // console.log(res);
  
  // console.log(await get_tokens(0));
  // 
  // console.log(await get_tokens(-1));
  // 
  
  // console.log(await get_tokens(null, '05bf606cac86195d60776b6ae4ecd4c0'));
  // console.log(await get_tokens(null, null, '05bf606cc076a69b1acc269db2f6156c'));
  
  // console.log(await get_tokens_offset(0, 2, true));
  
  // console.log(await get_tokens_from_id('05bf606c35e36224244b8f76279a4190', 2, false));
  // console.log(await get_tokens_from_id('05bf606c45c080b7fc6803e838a54d22', 2, false));
  // console.log(await get_tokens_from_id('05bf606cac86195d60776b6ae4ecd4c0', 2, false));
  // console.log(await get_tokens_from_id('05bf606cc076a69b1acc269db2f6156c', 2, true));
  
  // console.log(await get_tokens_until_id('05bf606c9df9dff9ac8432eafc104644', 2, false)); // 7
  // console.log(await get_tokens_until_id('05bf606cc076a69b1acc269db2f6156c', 2, false)); // 9
  
  // console.log(await get_tokens_until_id('05bf606c45c080b7fc6803e838a54d22', 2, true)); // 1
  console.log(await get_tokens_until_id('05bf606c35e36224244b8f76279a4190', 2, true)); // 0
})();

