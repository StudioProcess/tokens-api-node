import tap from 'tap';
import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';
import { request as got } from '../test_util.mjs';

let tokens;
let main;

const secret = 'y2ZHC@KS/KW6Nw;whGVKl-Nc2y/;HpOc';
const jwt = {
  // auth tokens with iat 1618911347
  'public': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWJsaWMiLCJpYXQiOjE2MTg5MTEzNDd9.AEVgH4zM-Uhwe5WjNOtoumah7jPJS4JbecOR1jXiJ4M',
  'exhibition': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGhpYml0aW9uIiwiaWF0IjoxNjE4OTExMzQ3fQ.e5kY-LCmQExcF-2_KwQLb0GwNxBumZ0JnXQpug1v0Gw',
  'generator': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnZW5lcmF0b3IiLCJpYXQiOjE2MTg5MTEzNDd9.h7SozQu7gvVvOyz2oTYDY0l1KmRtcgdlvsjUzzjfOOc',
  'admin': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTYxODkxMTM0N30.03J1hfDICkGYnZkb-AHfo1vg_fcwX3XbiCeCb8R1kOo',
  'nosub': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2MTg5MTEzNDd9.jMi0STz9YCWO0sfHo0hKQZhfOPUzVmXl2cmDYxpf-kg',
  // Invalid auth tokens
  'garbage': 'asdkfkjalsdfjasdkfkjalsdfjasdkfkjalsdfjasdkfkjalsdfj',
  'public_invalid': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWJsaWMiLCJpYXQiOjE2MTg5MTEzNDd9.XXXXX',
  'public_expired': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWJsaWMiLCJpYXQiOjB9.QEtArEa4Iz5ZltOWAHsH8FsF2TBqpq21OpfUpX2XHmU',
  // Timing (w/exhibition subject)
  'not_yet': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGhpYml0aW9uIiwiaWF0IjoxNjE5MDEyNjUxLCJuYmYiOjQ3NjUxMzI4MDAsImV4cCI6NDc3MjkwODgwMH0.J8ptiAnX3UQr5lO_F3yO2UBWWEHxG3utiig36kw5Pgo',
  'expired': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGhpYml0aW9uIiwiaWF0IjoxNjE5MDE0MTY3LCJuYmYiOjE1Nzc4MzY4MDAsImV4cCI6MTYwOTQ1OTIwMH0.hqbEGSGEUw3R2h_OqjLUO-HOXHcQjyY_wRZcDRqTUxk',
  'in_time': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGhpYml0aW9uIiwiaWF0IjoxNjE5MDEyNjI2LCJuYmYiOjE1Nzc4MzY4MDAsImV4cCI6NDc2NTEzMjgwMH0.e-lovqukzSJcH7Hacx03nCh2wqPtgpcGVG2HMR2N4_w',
};

tap.before(async () => {
  // setup mock databases
  tokens = await test_util.setup_mock_db();
  // make requests fail faster
  db.DB.request_options = {
    retry: 0
  };
  // start server
  process.env.JWT_SECRET = secret; // override secret to be used
  main = await test_util.start_server(true); // server with auth enabled
  main.CONFIG.auth.subject_issued_at.public = 1618911347;
  main.CONFIG.auth.subject_issued_at.exhibition = 1618911347;
  main.CONFIG.auth.subject_issued_at.generator = 1618911347;
  main.CONFIG.auth.subject_issued_at.admin = 1618911347;
});

tap.teardown(async () => {
  test_util.teardown_mock_db();
  test_util.stop_server();
});

tap.test('auth enabled', async t => {
  t.equal(main.CONFIG.auth.enabled, true);
});

tap.test('get token', async t => {
  let res = await got('/token', {
    responseType: 'json',
    searchParams: { id: tokens[0].id },
    headers: { 'Authorization': 'Bearer ' + jwt.public }
  });
  t.equal(res.statusCode, 200, 'valid auth');
  
  res = await got('/token', {
    responseType: 'json',
    searchParams: { id: tokens[0].id },
    headers: { 'Authorization': 'Bearer ' + jwt.admin }
  });
  t.equal(res.statusCode, 200, 'valid auth (other valid subject)');
  
  try {
    let res = await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 401,
      body: {error: 'invalid auth'}
    }, 'no auth provided');
  }
  
  try {
    let res = await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      headers: { 'Authorization': 'Bearer ' + jwt.exhibition }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 403,
      body: {error: 'wrong subject'}
    }, 'wrong subject');
  }
  
  try {
    let res = await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      headers: { 'Authorization': 'Bearer ' + jwt.public_invalid }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 401,
      body: {error: 'invalid auth'}
    }, 'invalid token (wrong signature)');
  }
  
  try {
    let res = await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      headers: { 'Authorization': 'Bearer ' + jwt.garbage }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 401,
      body: {error: 'invalid auth'}
    }, 'invalid token (garbage)');
  }
  
  try {
    let res = await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      headers: { 'Authorization': 'Bearer ' + jwt.public_expired }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 403,
      body: {error: 'subject expired'}
    }, 'invalid token (subject expired)');
  }
});

tap.test('request_interaction', async t => {
  try {
    let res = await got('/request_interaction', {
      responseType: 'json',
      headers: { 'Authorization': 'Bearer ' + jwt.not_yet }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 401,
      body: {error: 'token not yet active'}
    }, 'not yet active');
  }
  
  try {
    let res = await got('/request_interaction', {
      responseType: 'json',
      headers: { 'Authorization': 'Bearer ' + jwt.expired }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 401,
      body: {error: 'token expired'}
    }, 'expired');
  }
  
  let res = await got('/request_interaction', {
    responseType: 'json',
    headers: { 'Authorization': 'Bearer ' + jwt.in_time }
  });
  t.equal(res.statusCode, 200, 'in time');
});

tap.test('no auth needed', async t => {
  let res = await got('/svg', {
    searchParams: { id: tokens[0].id }
  });
  t.equal(res.statusCode, 200, 'no auth');
  
  res = await got('/svg', {
    searchParams: { id: tokens[0].id },
    headers: { 'Authorization': 'Bearer ' + jwt.garbage }
  });
  t.equal(res.statusCode, 200, 'no auth needed, but garbage supplied');
  
  res = await got('/svg', {
    searchParams: { id: tokens[0].id },
    headers: { 'Authorization': 'Bearer ' + jwt.public }
  });
  t.equal(res.statusCode, 200, 'no auth needed, but valid supplied');
  
  res = await got('/svg', {
    searchParams: { id: tokens[0].id },
    headers: { 'Authorization': 'Bearer ' + jwt.public_invalid }
  });
  t.equal(res.statusCode, 200, 'no auth needed, but invalid supplied');
});

tap.test('check all routes', async t => {
  async function check_route(method, route, allowed_subs, ) {
    const all_subs = ['public', 'exhibition', 'generator', 'admin', 'nosub'];
    for (let sub of all_subs) {
      if (allowed_subs.includes(sub)) {
        // should get a 200 or some error, but NOT errors 401 and 403
        try {
          let res = await got(route, {
            method, 
            headers: { 'Authorization': 'Bearer ' + jwt[sub] }
          });
          t.equal(res.statusCode, 200, `${route} ${sub} 200`)
        } catch (e) {
          t.ok( e.response.statusCode != 401 && e.response.statusCode != 403, `${route} ${sub} -> allowed`);
        }
      } else {
        // should get a 401 or 403
        try {
          let res = await got(route, {
            method,
            headers: { 'Authorization': 'Bearer ' + jwt[sub] }
          });
          t.fail(`${route} should not allow sub ${sub}`)
        } catch (e) {
          t.ok( e.response.statusCode == 401 || e.response.statusCode == 403, `${route} ${sub} -> rejected`);
        }
      }
    }
  }
  
  // make a new interction for get_new_interaction_updates (otherwise the request waits)
  let int = await db.request_interaction();
  await db.deposit_interaction(int.id, ['a', 'b', 'c']);
  
  await check_route('get', '/token', ['public', 'admin']);
  await check_route('get', '/tokens', ['public', 'admin']);
  
  await check_route('get', '/svg', ['public', 'exhibition', 'generator', 'admin', 'nosub']);
  
  await check_route('get', '/request_interaction', ['exhibition', 'admin']);
  await check_route('get', '/deposit_interaction', ['exhibition', 'admin']);
  await check_route('get', '/interaction_updates', ['exhibition', 'admin']);
  
  await check_route('put', '/token', ['generator', 'admin']);
  await check_route('get', '/new_interaction_updates', ['generator', 'admin']);
  await check_route('get', '/update_interaction', ['generator', 'admin']);
});
