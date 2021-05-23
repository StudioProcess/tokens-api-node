import tap from 'tap';
import { short_id, pad_id, unpad_id, sleep } from '../util.mjs';

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
    t.equal( pad_id(unpad_id(id)), id )
  }
});
