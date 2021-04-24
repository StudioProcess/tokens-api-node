import tap from 'tap';
import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';

let tokens = [];  

// setup/teardown mock databases
tap.before(async () => {
  tokens = await test_util.setup_mock_db();
});
tap.teardown(test_util.teardown_mock_db);

tap.test('new interaction updates', async t => {
  // create 3 new interactions
  const res1 = await db.request_interaction();
  const res1x = await db.deposit_interaction(res1.id, ['a','b','c']);
  const res2 = await db.request_interaction();
  const res2x = await db.deposit_interaction(res2.id, ['x','y','z']);
  const res3 = await db.request_interaction();
  const res4x = await db.deposit_interaction(res3.id, ['u','v','w']);
  const ids = new Set([res1.id, res2.id, res3.id]);
  
  // updates may be out of order, but need to be distinct
  const res4 = await db.get_new_interaction_updates();
  t.ok( ids.delete(res4.id) ); // Set.prototype.delete() returns true if value was in set
  const res5 = await db.get_new_interaction_updates(res4.seq);
  t.ok( ids.delete(res5.id) );
  const res6 = await db.get_new_interaction_updates(res5.seq);
  t.ok( ids.delete(res6.id) );
});

tap.test('single interaction updates', async t => {
  // update a single interaction multiple times
  const res = await db.request_interaction();
  let resx = await db.update_interaction(res.id, 1); // this sets status 'waiting', so updates should be dispatched
  resx = await db.update_interaction(res.id, 2);
  resx = await db.update_interaction(res.id, 3);
  resx = await db.update_interaction(res.id, 4);
  resx = await db.update_interaction(res.id, 5);
  
  // intermediate updates of a single document are not guaranteed
  // in this case only the newest update is returned
  let res1 = await db.get_single_interaction_updates(res.id);
  t.equal(res1.queue_position, 5, 'got most recent result');
});