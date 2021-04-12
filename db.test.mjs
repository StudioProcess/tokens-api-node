import tap from 'tap';
import * as db from './db.mjs';
import * as util from './util.mjs';


const tokens = [];
const match_id = /[0-9a-f]{32}/; // 32 hex digits

// setup mock databases
tap.before(async () => {
  console.log('running before:');
  const rnd_id = util.rnd_hash(7);
  db.DB.tokens_db += '-' + rnd_id;
  db.DB.interactions_db += '-' + rnd_id;
  
  console.log('creating db ' + db.DB.tokens_db);
  await db.create_db(db.DB.tokens_db);
  
  console.log('creating db ' + db.DB.interactions_db);
  await db.create_db(db.DB.interactions_db);
  await util.sleep(500); // will fail if putting immediately
  
  console.log('creating filters');
  await db.create_filters();
  
  // create a bunch of token docs
  console.log('creating tokens');
  for (let i=0; i<10; i++) {
    const token = {
      svg: util.random_svg(),
      generated: util.timestamp(),
    };
    const res = await db.put_token(token);
    token.id = res.id;
    tokens.push(token);
  }
  tokens.reverse();
});

tap.teardown(async () => {
  console.log('running teardown:');
  console.log('deleting db ' + db.DB.tokens_db);
  await db.delete_db(db.DB.tokens_db);
  console.log('deleting db ' + db.DB.interactions_db);
  await db.delete_db(db.DB.interactions_db);
});




tap.test('put token', async t => {
  const token = {
    svg: util.random_svg(),
    generated: util.timestamp(),
  };
  const res = await db.put_token(token);
  t.match(res, { id: match_id }, 'result is valid');
  
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
  
  // last page
  res = await db.get_tokens(-1, null, null, 3, true);
  // console.log(res);
  t.same(res.rows[0], tokens[tokens.length-3]);
  t.same(res.rows[1], tokens[tokens.length-2]);
  t.same(res.rows[2], tokens[tokens.length-1]);
  t.hasStrict(res, {
    offset: tokens.length-3,
    total_rows: tokens.length,
    newest_first: true,
    prev: tokens[tokens.length-4].id,
    next: null,
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
  t.match(res, {id: match_id, color:0 }, 'got interaction id and color');
  
  const res1 = await db.deposit_interaction(res.id, keywords);
  t.equal(res1, '', 'sucessfully deposited interaction');
  
  const res2 = await db.get_single_interaction_updates(id);
  t.has(res2, {id, queue_position:2, token_id:null}, 'received queue update (2)');
  const res3 = await db.get_single_interaction_updates(res2.id, res2.seq);
  t.has(res3, {id, queue_position:1, token_id:null}, 'received queue update (1)');
  const res4 = await db.get_single_interaction_updates(res3.id, res3.seq);
  t.has(res4, {id, queue_position:0, token_id}, 'received token update');
});

