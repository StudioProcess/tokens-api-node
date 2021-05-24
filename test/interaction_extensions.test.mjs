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
  await test_util.start_server();
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
