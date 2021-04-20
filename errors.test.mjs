import tap from 'tap';
import got from 'got';
import * as db from './db.mjs';
import * as util from './util.mjs';
import * as test_util from './test_util.mjs';

let tokens;

tap.before(async () => {
  // setup mock databases
  tokens = await test_util.setup_mock_db();
  // make requests fail faster
  db.DB.request_options = {
    retry: 0
  };
  // start server
  await test_util.start_server();
});

tap.teardown(async () => {
  test_util.teardown_mock_db();
  test_util.stop_server();
});


tap.test('get token (errors)', async t => {
  // db down
  const url_save = db.DB.url;
  db.DB.url = 'http://localhost:9999';
  try {
    await got('http://localhost:3000/get_token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      retry: 0
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 503,
      body: {error: 'db down'}
    }, 'db down');
  }
  db.DB.url = url_save;
  
  // no id
  try {
    await got('http://localhost:3000/get_token', {
      responseType: 'json',
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'no id');
  }
  
  // empty id
  try {
    await got('http://localhost:3000/get_token', {
      responseType: 'json',
      searchParams: { id: '' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'empty id');
  }
  
  // invalid id
  try {
    await got('http://localhost:3000/get_token', {
      responseType: 'json',
      retry: 0,
      searchParams: { id: 'abcdef' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'token not found'}
    }, 'invalid id');
  }
});

tap.test('get tokens by offset (errors)', async t => {
  try {
    await got('http://localhost:3000/get_tokens', {
      responseType: 'json',
      searchParams: {}
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'need offset, start_id or end_id'}
    }, 'none of offset, start_id, end_id given');
  }
  
  try {
    await got('http://localhost:3000/get_tokens', {
      responseType: 'json',
      searchParams: { offset:0, count:0 }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'count out of range'}
    }, 'count too small');
  }
  
  try {
    await got('http://localhost:3000/get_tokens', {
      responseType: 'json',
      searchParams: { offset:0, count:999999 }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'count out of range'}
    }, 'count too big');
  }
  
  let res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:10, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:10, rows: [], prev: tokens[9].id, next: null }
  }, 'going one over');
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:99, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:99, rows: [], prev: null, next: null }
  }, 'going over more');
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:-11, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:-11, rows: [], prev: null, next: tokens[0].id }
  }, 'going one below');
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:-99, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:-99, rows: [], prev: null, next: null }
  }, 'going below more');
});

