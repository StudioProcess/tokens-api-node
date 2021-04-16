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
