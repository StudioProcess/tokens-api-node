import tap from 'tap';
import { short_id, id_in, id_out, sleep } from '../util.mjs';
import * as test_util from '../test_util.mjs';
import * as db from '../db.mjs';

// setup/teardown mock databases
tap.before(test_util.setup_mock_db);
tap.teardown(test_util.teardown_mock_db);


tap.test('generating ids', async t => {
  // generate 100 ids
  let ids = [];
  for (let i=0; i<100; i++) {
    ids.push( short_id() );
    await sleep(2);
  }
  for (let i=0; i<100; i++) {
    let id = ids[i];
    t.notOk( ids.includes(id, i+1) )
  }
});


tap.test('padding/unpadding ids', async t => {
  // generate 1000 ids
  let ids = [];
  for (let i=0; i<100; i++) {
    ids.push( short_id() );
    await sleep(2);
  }
  for (let i=0; i<100; i++) {
    let id = ids[i];
    t.equal( id_in(id_out(id)), id )
  }
});

tap.test('creating tokens with proper sleep', async t => {
  for (let i=0; i<100; i++) {
      let promise = db.put_token({ note: 'proper ' + i}, 0); // no retries
      await t.resolves(promise);
  }
});

tap.test('creating tokens without waiting ', async t => {
  for (let i=0; i<100; i++) {
      let promise = db.put_token({ note: 'proper ' + i}, 10);
      t.resolves(promise); // don't await
  }
});
