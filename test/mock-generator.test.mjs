import tap from 'tap';
import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';
import { request as got } from '../test_util.mjs';
import * as make_jwt from '../make_jwt.mjs';

let tokens;

const AUTH_GENERATOR = make_jwt.make('generator'); // create valid auth token with subject 'exhibition'
const AUTH_TOKEN = make_jwt.make('exhibition'); // create valid auth token with subject 'exhibition'

tap.before(async () => {
  // setup mock databases
  tokens = await test_util.setup_mock_db();
  // make requests fail faster
  db.DB.request_options = {
    retry: { limit: 0 }
  };
  // start server
  await test_util.start_server(true); // start server with auth enabled
  // start mock generator
  await test_util.start_generator();
});

tap.teardown(async () => {
  test_util.stop_generator();
  test_util.stop_server();
  test_util.teardown_mock_db();
});


async function test_queue(t, interaction_id, since=0, queue_pos=null) {
  let res = await got('/interaction_updates', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: interaction_id, since }
  });
  t.equal(res.body.id, interaction_id, `interaction update ${res.body.id} (${res.body.queue_position})`);
  if (queue_pos != null) t.equal(res.body.queue_position, queue_pos, 'queue position');
  if (res.body.queue_position == 0) {
    t.match(res.body.token_id, test_util.match_short_id, 'token generated');
    let res2 = await got('/token', {
      responseType: 'json',
      searchParams: { id: res.body.token_id }
    });
    // console.log('got token:', res2.body);
    t.match(res2.body.id, res.body.token_id, 'retrieved token');
  } else await test_queue(t, interaction_id, res.body.seq, res.body.queue_position-1);
}


tap.test('interaction sequence', async t => {
  // interaction 1
  const res1 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.match(res1.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (1)');
  const res1x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  t.equal(res1x.statusCode, 200, 'deposit interaction (1)');
  t.test(async t => {
    await test_queue(t, res1.body.id);
  });

  // interaction 2
  const res2 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.match(res2.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (2)');
  const res2x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res2.body.id, keywords: 'd,e,f' }
  });
  t.equal(res2x.statusCode, 200, 'deposit interaction (2)');
  t.test(async t => {
    await test_queue(t, res2.body.id);
  });

  // interaction 3
  const res3 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.match(res3.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (3)');
  const res3x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res3.body.id, keywords: 'd,e,f' }
  });
  t.equal(res3x.statusCode, 200, 'deposit interaction (3)');
  t.test(async t => {
    await test_queue(t, res3.body.id);
  });
});

tap.test('waiting interactions', async t => {
  // interaction 1
  const res1 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.equal(res1.statusCode, 200, 'request interaction');
  const res1x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  t.equal(res1x.statusCode, 200, 'deposit interaction');
  
  // interaction 2
  const res2 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.equal(res2.statusCode, 200, 'request interaction');
  const res2x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res2.body.id, keywords: 'x,y,z' }
  });
  t.equal(res2x.statusCode, 200, 'deposit interaction');
  
  // interaction 3
  const res3 = await got('/request_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
  });
  t.equal(res3.statusCode, 200, 'request interaction');
  const res3x = await got('/deposit_interaction', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: { id: res3.body.id, keywords: 'x,y,z' }
  });
  t.equal(res3x.statusCode, 200, 'deposit interaction');
  
  // wait for interaction 1 to complete
  await t.test(async t => {
    await test_queue(t, res1.body.id);
  });
  // crash generator and restart, picks up interaction 2 and 3
  console.log("CRASH")
  test_util.stop_generator();
  await util.sleep(1000);
  console.log("RESTART")
  await test_util.start_generator();
  t.test(async t => {
    await test_queue(t, res2.body.id);
  });
  t.test(async t => {
    await test_queue(t, res3.body.id);
  });

});