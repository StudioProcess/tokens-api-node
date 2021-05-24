import tap from 'tap';
// import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';
import { request as got } from '../test_util.mjs';

let tokens = [];  

// setup/teardown mock databases
tap.before(async () => {
  tokens = await test_util.setup_mock_db();
  // start server
  await test_util.start_server(false, 5);
});
tap.teardown(async () => {
  test_util.teardown_mock_db();
  test_util.stop_server();
});


tap.test('timestamps for incomplete interactions', async t => {
  let res = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res.body, { requested_at: test_util.match_timestamp });
});


tap.test('timestamps for deposited interactions', async t => {
  let res1 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res1.body, { requested_at: test_util.match_timestamp });
  
  let res2 = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  
  let res3 = await got('/new_interaction_updates', {
    responseType: 'json',
  });
  t.match(res3.body, { 
    requested_at: res1.body.requested_at,
    deposited_at: test_util.match_timestamp,
  });
});


tap.test('depositing again', async t => {
  let res1 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res1.body, { requested_at: test_util.match_timestamp });
  
  let res2 = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  t.equal(res2.statusCode, 200);
  
  try {
    await got('/deposit_interaction', {
      responseType: 'json',
      searchParams: { id: res1.body.id, keywords: 'x,y,z' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'already deposited'}
    }, 'already deposited');
  }
});


tap.test('retrieve interrupted (waiting) interactions', async t => {
  // interaction 1
  let res1 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res1.body, { requested_at: test_util.match_timestamp });
  
  let res1x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  t.equal(res1x.statusCode, 200);
  
  // interaction 2
  let res2 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res2.body, { requested_at: test_util.match_timestamp });
  
  let res2x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res2.body.id, keywords: 'x,y,z' }
  });
  t.equal(res2x.statusCode, 200);
  // interaction 3
  let res3 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res3.body, { requested_at: test_util.match_timestamp });
  
  let res3x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res3.body.id, keywords: 'u,v,w' }
  });
  t.equal(res3x.statusCode, 200);
  
  // check (nothing)
  let res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.same(res.body, []);
  
  
  // complete interaction 2
  let res4 = await got('/update_interaction', {
    responseType: 'json',
    searchParams: { id: res2.body.id, token_id: tokens[0].id }
  });
  t.equal(res4.statusCode, 200);
  
  // check (nothing)
  res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.same(res.body, []);
  
  
  // update interaction 1
  let res5 = await got('/update_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, queue_position: 1 }
  });
  t.equal(res5.statusCode, 200);
  
  // check (1 waiting)
  res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.equal(res.body.length, 1);
  t.match(res.body[0], res1.body);
  
  // update interaction 3
  let res6 = await got('/update_interaction', {
    responseType: 'json',
    searchParams: { id: res3.body.id, queue_position: 2 }
  });
  t.equal(res6.statusCode, 200);
  
  // check (2 waiting)
  res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.equal(res.body.length, 2);
  t.match(res.body[0], res1.body);
  t.match(res.body[1], res3.body);
  
  // complete interaction 1
  let res7 = await got('/update_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, token_id: tokens[1].id }
  });
  t.equal(res7.statusCode, 200);
  
  // check (1 waiting)
  res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.equal(res.body.length, 1);
  t.match(res.body[0], res3.body);
  
  // complete interaction 3
  let res8 = await got('/update_interaction', {
    responseType: 'json',
    searchParams: { id: res3.body.id, token_id: tokens[3].id }
  });
  t.equal(res8.statusCode, 200);
  
  // check (nothing)
  res = await got('/waiting_interactions', {
    responseType: 'json'
  });
  t.equal(res.statusCode, 200);
  t.same(res.body, []);
});
