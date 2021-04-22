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
  // start mock generator
  await test_util.start_generator();
});

tap.teardown(async () => {
  test_util.stop_generator();
  test_util.stop_server();
  test_util.teardown_mock_db();
});


async function test_queue(t, interaction_id, since=0, queue_pos=null) {
  let res = await got('/get_single_interaction_updates', {
    responseType: 'json',
    searchParams: { id: interaction_id, since }
  });
  t.equal(res.body.id, interaction_id, `interaction update ${res.body.id} (${res.body.queue_position})`);
  if (queue_pos != null) t.equal(res.body.queue_position, queue_pos, 'queue position');
  if (res.body.queue_position == 0) {
    t.match(res.body.token_id, test_util.match_id, 'token generated');
    let res2 = await got('/get_token', {
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
    responseType: 'json',
  });
  t.match(res1.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (1)');
  const res1x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res1.body.id, keywords: 'a,b,c' }
  });
  t.equal(res1x.statusCode, 200, 'deposit interaction (1)');
  t.test(async t => {
    await test_queue(t, res1.body.id);
  });
  
  // interaction 2
  const res2 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res2.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (2)');
  const res2x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res2.body.id, keywords: 'd,e,f' }
  });
  t.equal(res2x.statusCode, 200, 'deposit interaction (2)');
  t.test(async t => {
    await test_queue(t, res2.body.id);
  });
  
  // interaction 3
  const res3 = await got('/request_interaction', {
    responseType: 'json',
  });
  t.match(res3.body, { id: test_util.match_id, color: test_util.match_color }, 'request interaction (3)');
  const res3x = await got('/deposit_interaction', {
    responseType: 'json',
    searchParams: { id: res3.body.id, keywords: 'd,e,f' }
  });
  t.equal(res3x.statusCode, 200, 'deposit interaction (3)');
  t.test(async t => {
    await test_queue(t, res3.body.id);
  });
});