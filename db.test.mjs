import tap from 'tap';
import * as db from './db.mjs';
import * as util from './util.mjs';
import * as test_util from './test_util.mjs';

let tokens = [];  

// setup/teardown mock databases
tap.before(async () => {
  tokens = await test_util.setup_mock_db();
});
tap.teardown(test_util.teardown_mock_db);


tap.test('put token', async t => {
  const token = {
    svg: util.random_svg(),
    generated: util.timestamp(),
  };
  const res = await db.put_token(token);
  t.match(res, { id: test_util.match_id }, 'result is valid');
  
  const res1 = await db.get_single_token(res.id);
  t.same(res1, { id: res.id, svg: token.svg, generated: token.generated }, 'get successful');
  
  const res2 =  await db.delete_token(res.id);
  t.equal(res2, '', 'deleted sucessfully');
});


tap.test('get tokens by offset', async t => {
  // first page
  let res = await db.get_tokens(0, null, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[0]);
  t.same(res.rows[1], tokens[1]);
  t.same(res.rows[2], tokens[2]);
  t.hasStrict(res, {
    offset: 0,
    total_rows: tokens.length,
    newest_first: true,
    prev: null,
    next: tokens[3].id,
  });
  
  // middle page
  res = await db.get_tokens(4, null, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[4]);
  t.same(res.rows[1], tokens[5]);
  t.same(res.rows[2], tokens[6]);
  t.hasStrict(res, {
    offset: 4,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[3].id,
    next: tokens[7].id,
  });
  
  // hanging at the end
  res = await db.get_tokens(8, null, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[8]);
  t.same(res.rows[1], tokens[9]);
  t.hasStrict(res, {
    offset: 8,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[7].id,
    next: null
  });
  
  // overshoot
  res = await db.get_tokens(10, null, null, 3, true);
  // console.log(res);
  t.hasStrict(res, {
    rows: [],
    offset: 10,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[9].id,
    next: null
  });
  
  // overshoot fully
  res = await db.get_tokens(11, null, null, 3, true);
  // console.log(res);
  t.hasStrict(res, {
    rows: [],
    offset: 11,
    total_rows: tokens.length,
    newest_first: true,
    prev:  null,
    next: null
  });
});

tap.test('get tokens by offset (negative)', async t => {
  // middle
  let res = await db.get_tokens(-3, null, null, 2, true);
  // console.log(res);
  t.same(res.rows[0], tokens[tokens.length-3]);
  t.same(res.rows[1], tokens[tokens.length-2]);
  t.hasStrict(res, {
    offset: -3,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[tokens.length-4].id,
    next: tokens[tokens.length-1].id,
  });
  
  // just the last one
  res = await db.get_tokens(-1, null, null, 1, true);
  // console.log(res);
  t.same(res.rows[0], tokens[tokens.length-1]);
  t.hasStrict(res, {
    offset: -1,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[tokens.length-2].id,
    next: null
  });
  
  // hanging at the end
  res = await db.get_tokens(-3, null, null, 5, true);
  // console.log(res);
  t.same(res.rows[0], tokens[tokens.length-3]);
  t.same(res.rows[1], tokens[tokens.length-2]);
  t.same(res.rows[2], tokens[tokens.length-1]);
  t.hasStrict(res, {
    offset: -3,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[tokens.length-4].id,
    next: null
  });
  
  // all the way back
  res = await db.get_tokens(-tokens.length, null, null, 2, true);
  t.same(res.rows[0], tokens[0]);
  t.same(res.rows[1], tokens[1]);
  t.hasStrict(res, {
    offset: -tokens.length,
    total_rows: tokens.length,
    newest_first: true,
    prev: null,
    next: tokens[2].id,
  });
  
  // overshoot
  res = await db.get_tokens(-tokens.length-1, null, null, 1, true);
  t.hasStrict(res, {
    rows: [],
    offset: -tokens.length-1,
    total_rows: tokens.length,
    newest_first: true,
    prev: null,
    next: tokens[0].id,
  });
  
  // overshoot fully
  res = await db.get_tokens(-tokens.length-10, null, null, 1, true);
  t.hasStrict(res, {
    rows: [],
    offset: -tokens.length-10,
    total_rows: tokens.length,
    newest_first: true,
    prev: null,
    next: null,
  });
});


tap.test('get tokens from start id', async t => {
  let res = await db.get_tokens(null, tokens[0].id, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[0]);
  t.same(res.rows[1], tokens[1]);
  t.same(res.rows[2], tokens[2]);
  t.hasStrict(res, {
    offset: 0,
    total_rows: tokens.length,
    newest_first: true,
    prev: null,
    next: tokens[3].id,
  });
  // next page
  res = await db.get_tokens(null, res.next, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[3]);
  t.same(res.rows[1], tokens[4]);
  t.same(res.rows[2], tokens[5]);
  t.hasStrict(res, {
    offset: 3,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[2].id,
    next: tokens[6].id,
  });
});


tap.test('get tokens until end id', async t => {
  // last page
  let res = await db.get_tokens(null, null, tokens[9].id, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[7]);
  t.same(res.rows[1], tokens[8]);
  t.same(res.rows[2], tokens[9]);
  t.hasStrict(res, {
    offset: 7,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[6].id,
    next: null,
  });
  // page before
  res = await db.get_tokens(null, null, res.prev, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[4]);
  t.same(res.rows[1], tokens[5]);
  t.same(res.rows[2], tokens[6]);
  t.hasStrict(res, {
    offset: 4,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[3].id,
    next: tokens[7].id,
  });
});


tap.test('interaction process', async t => {
  let id = '';
  const keywords = ['careful', 'truth', 'march'];
  let color;
  let token_id = '';
  
  t.test(async t => {
    const res = await db.get_new_interaction_updates();
    t.equal(res.id, id, 'received new interaction update');
    t.same(res.keywords, keywords, 'with correct keywords');
    t.same(res.color, color, 'and correct color');
    
    await util.sleep(100);
    const res2 = await db.update_interaction(res.id, 2);
    t.equal(res2, '', 'successful queue update (2)');
    await util.sleep(100);
    const res3 = await db.update_interaction(res.id, 1);
    t.equal(res3, '', 'successful queue update (1)');
    await util.sleep(100);
    token_id = util.rnd_hash(32);
    const res4 = await db.update_interaction(res.id, null, token_id);
    t.equal(res4, '', 'successful token update');
  });
  
  const res = await db.request_interaction();
  id = res.id;
  color = res.color;
  t.match(res, {id: test_util.match_id, color: test_util.match_color }, 'got interaction id and color');
  
  const res1 = await db.deposit_interaction(res.id, keywords);
  t.equal(res1, '', 'sucessfully deposited interaction');
  
  const res2 = await db.get_single_interaction_updates(id);
  t.has(res2, {id, queue_position:2, token_id:null}, 'received queue update (2)');
  const res3 = await db.get_single_interaction_updates(res2.id, res2.seq);
  t.has(res3, {id, queue_position:1, token_id:null}, 'received queue update (1)');
  const res4 = await db.get_single_interaction_updates(res3.id, res3.seq);
  t.has(res4, {id, queue_position:0, token_id}, 'received token update');
});

tap.test('interaction queue size', async t => {
  let res = await db.interaction_queue_size();
  t.equal(res, 0);
  
  let res1 = await db.request_interaction();
  res = await db.interaction_queue_size();
  t.equal(res, 0);
  
  let res1x = await db.update_interaction(res1.id, 0);
  res = await db.interaction_queue_size();
  t.equal(res, 1);
  
  let res2 = await db.request_interaction()
  let res2x = await db.update_interaction(res2.id, 1);
  res = await db.interaction_queue_size();
  t.equal(res, 2);
  
  res1x = await db.update_interaction(res1.id, null, 'fake_token_id');
  res = await db.interaction_queue_size();
  t.equal(res, 1);
  
  res2x = await db.update_interaction(res2.id, 0);
  res = await db.interaction_queue_size();
  t.equal(res, 1);
  
  res2x = await db.update_interaction(res2.id, null, 'fake_token_id');
  res = await db.interaction_queue_size();
  t.equal(res, 0);
});
