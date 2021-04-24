import tap from 'tap';
import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';
import { request as got } from '../test_util.mjs';

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


tap.test('main route', async t => {
  let res = await got('/', {responseType:'json'});
  t.has(res.body, {  });
  t.match(res.body, {
    name: /.*/,
    description: /.*/,
    version: /.*/,
    git_sha: util.git_sha() 
  });
});

tap.test('get token', async t => {
  let res = await got('/token', {
    responseType: 'json',
    searchParams: { id: tokens[0].id }
  });
  t.same(res.body, tokens[0]);
});

tap.test('get svg', async t => {
  let res = await got('/svg', {
    searchParams: { id: tokens[0].id }
  });
  t.same(res.body, tokens[0].svg, 'got svg text');
  t.match(res.headers, {'content-type': 'image/svg+xml; charset=utf-8'}, 'headers')
  
  res = await got('/svg', {
    searchParams: { id: tokens[1].id, download:true }
  });
  t.same(res.body, tokens[1].svg, 'got svg text');
  t.match(res.headers, {
    'content-type': 'application/octet-stream; charset=utf-8',
    'content-disposition': `attachment; filename="token-${tokens[1].id}.svg"`
  }, 'headers');
});

tap.test('put token', async t => {
  const token = {
    svg: util.random_svg(),
    generated: util.timestamp(),
    keywords: ['x', 'y', 'z']
  };
  let res = await got('/token', {
    method: 'put',
    responseType: 'json',
    json: token
  });
  t.match(res.body.id, test_util.match_id);
  try {
    res = await db.delete_token(res.body.id);
    t.equal(res, '', 'deleted again');
  } catch {
    t.fail('error deleting token again');
  }
});


tap.test('get tokens (offset)', async t => {
  let res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:0, count:1 }
  });
  t.same(res.body.offset, 0);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[0]);
  t.same(res.body.prev, null);
  t.same(res.body.next, tokens[1].id);
  t.same(res.body.newest_first, true);
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:1, count:2 }
  });
  t.same(res.body.offset, 1);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[1]);
  t.same(res.body.rows[1], tokens[2]);
  t.same(res.body.prev, tokens[0].id);
  t.same(res.body.next, tokens[3].id);
  t.same(res.body.newest_first, true);
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:tokens.length-1, count:1 }
  });
  t.same(res.body.offset, tokens.length-1);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[tokens.length-1]);
  t.same(res.body.prev, tokens[tokens.length-2].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
});

tap.test('get tokens (negative offset)', async t => {
  let res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:-1, count:1 }
  });
  t.hasStrict(res.body, {
    offset: -1,
    total_rows: tokens.length,
    rows: [ tokens[9] ],
    prev: tokens[8].id,
    next: null,
    newest_first: true
  });
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:-5, count:3 }
  });
  t.hasStrict(res.body, {
    offset: -5,
    total_rows: tokens.length,
    rows: [ tokens[tokens.length-5], tokens[tokens.length-4], tokens[tokens.length-3] ],
    prev: tokens[tokens.length-6].id,
    next: tokens[tokens.length-2].id,
    newest_first: true
  });
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:-10, count:2 }
  });
  t.hasStrict(res.body, {
    offset: -10,
    total_rows: tokens.length,
    rows: [ tokens[0], tokens[1] ],
    prev: null,
    next: tokens[2].id,
    newest_first: true
  });
});

tap.test('get tokens (from id)', async t => {
  let res = await got('/tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[0].id, count:1 }
  });
  t.same(res.body.offset, 0);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[0]);
  t.same(res.body.prev, null);
  t.same(res.body.next, tokens[1].id);
  t.same(res.body.newest_first, true);
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[4].id, count:3 }
  });
  t.same(res.body.offset, 4);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[4]);
  t.same(res.body.rows[1], tokens[5]);
  t.same(res.body.rows[2], tokens[6]);
  t.same(res.body.prev, tokens[3].id);
  t.same(res.body.next, tokens[7].id);
  t.same(res.body.newest_first, true);
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[8].id, count:10 }
  });
  t.same(res.body.offset, 8);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[8]);
  t.same(res.body.rows[1], tokens[9]);
  t.same(res.body.prev, tokens[7].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
});

tap.test('get tokens (until id)', async t => {
  let res = await got('/tokens', {
    responseType: 'json',
    searchParams: { end_id:tokens[tokens.length-1].id, count:3 }
  });
  t.same(res.body.offset, tokens.length-3);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[tokens.length-3]);
  t.same(res.body.rows[1], tokens[tokens.length-2]);
  t.same(res.body.rows[2], tokens[tokens.length-1]);
  t.same(res.body.prev, tokens[tokens.length-4].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { end_id:tokens[5].id, count:2 }
  });
  t.same(res.body.offset, 4);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[4]);
  t.same(res.body.rows[1], tokens[5]);
  t.same(res.body.prev, tokens[3].id);
  t.same(res.body.next, tokens[6].id);
  t.same(res.body.newest_first, true);
});


tap.test('interaction colors', async t => {
  let res;
  // cycle through all colors
  for (let i=0; i < db.colors.length; i++) {
    res = await got('/request_interaction', {
      responseType: 'json',
    });
    t.match(res.body.id, test_util.match_id, 'got id');
    t.same(res.body.color, db.colors[i], 'got correct color');
  }
  
  res = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res.body.id, test_util.match_id, 'got id');
  t.same(res.body.color, db.colors[0], 'got first color again');
});


tap.test('interaction sequence', async t => {
  // request interaction
  let res = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res.body, { id: test_util.match_id, color: test_util.match_color });
  
  const new_token_id = tokens[0].id; // need to use existing token id
  
  // server
  t.test(async t => {
    let res2 = await got('/new_interaction_updates', {
      responseType: 'json',
    });
    t.match(res2.body, res.body);
    t.same(res2.body.keywords, ['a', 'b', 'c']);
    t.match(res2.body.seq, /.+/);
    
    // update queue
    await util.sleep(100);
    let res3 = await got('/update_interaction', {
      responseType: 'json',
      searchParams: { id: res2.body.id, queue_position: 3 }
    });
    t.equal(res3.statusCode, 200, 'update queue (3)');
    t.equal(res3.body, '');
    
    await util.sleep(100);
    res3 = await got('/update_interaction', {
      responseType: 'json',
      searchParams: { id: res2.body.id, queue_position: 2 }
    });
    t.equal(res3.statusCode, 200, 'update queue (2)');
    t.equal(res3.body, '');
    
    await util.sleep(100);
    res3 = await got('/update_interaction', {
      responseType: 'json',
      searchParams: { id: res2.body.id, queue_position: 1 }
    });
    t.equal(res3.statusCode, 200, 'update queue (1)');
    t.equal(res3.body, '');
    
    await util.sleep(100);
    res3 = await got('/update_interaction', {
      responseType: 'json',
      searchParams: { id: res2.body.id, token_id: new_token_id }
    });
    t.equal(res3.statusCode, 200, 'update token generated');
    t.equal(res3.body, '');
  });
  
  // complete interaction
  let res4 = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res.body.id, keywords: 'a,b,c' }
  });
  t.equal(res4.statusCode, 200, 'deposit interaction');
  t.equal(res4.body, '', 'no response data');
  
  // receive queue updates
  let res5 = await got('/interaction_updates', {
    responseType: 'json',
    searchParams: { id: res.body.id }
  });
  t.match(res5.body, {id: res.body.id, queue_position: 3, token_id: null});
  
  res5 = await got('/interaction_updates', {
    responseType: 'json',
    searchParams: { id: res.body.id, since: res5.body.seq }
  });
  t.match(res5.body, {id: res.body.id, queue_position: 2, token_id: null});
  
  res5 = await got('/interaction_updates', {
    responseType: 'json',
    searchParams: { id: res.body.id, since: res5.body.seq }
  });
  t.match(res5.body, {id: res.body.id, queue_position: 1, token_id: null});
  
  res5 = await got('/interaction_updates', {
    responseType: 'json',
    searchParams: { id: res.body.id, since: res5.body.seq }
  });
  t.match(res5.body, {id: res.body.id, queue_position: 0, token_id: new_token_id});
});
