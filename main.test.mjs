import crypto from 'crypto';
import tap from 'tap';
import * as main from './main.mjs';
import * as util from './utils.mjs';


const tokens = [];

// setup mock databases
tap.before(async () => {
  console.log('running before:');
  const rnd_id = util.rnd_hash(7);
  main.DB.tokens_db += '-' + rnd_id;
  main.DB.interactions_db += '-' + rnd_id;
  
  console.log('creating db ' + main.DB.tokens_db);
  await main.create_db(main.DB.tokens_db);
  
  console.log('creating db ' + main.DB.interactions_db);
  await main.create_db(main.DB.interactions_db);
  await util.sleep(500); // will fail if putting immediately
  
  console.log('creating filters');
  await main.create_filters();
  
  // create a bunch of token docs
  console.log('creating tokens');
  for (let i=0; i<10; i++) {
    const token = {
      svg: util.random_svg(),
      generated: util.timestamp(),
    };
    const res = await main.put_token(token);
    token.id = res.id;
    tokens.push(token);
  }
  tokens.reverse();
});

tap.teardown(async () => {
  console.log('running teardown:');
  console.log('deleting db ' + main.DB.tokens_db);
  await main.delete_db(main.DB.tokens_db);
  console.log('deleting db ' + main.DB.interactions_db);
  await main.delete_db(main.DB.interactions_db);
});




tap.test('put token', async t => {
  const token = {
    svg: util.random_svg(),
    generated: util.timestamp(),
  };
  const res = await main.put_token(token);
  t.match(res, { id: /.*/ }, 'result is valid');
  
  const res1 = await main.get_single_token(res.id);
  t.same(res1, { id: res.id, svg: token.svg, generated: token.generated }, 'get successful');
  
  const res2 =  await main.delete_token(res.id);
  t.equal(res2, '', 'deleted sucessfully');
});


tap.test('get tokens by offset', async t => {
  // first page
  let res = await main.get_tokens(0, null, null, 3, true);
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
  res = await main.get_tokens(-1, null, null, 3, true);
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
  res = await main.get_tokens(4, null, null, 3, true);
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
  let res = await main.get_tokens(null, tokens[0].id, null, 3, true);
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
  res = await main.get_tokens(null, res.next, null, 3, true);
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
  let res = await main.get_tokens(null, null, tokens[9].id, 3, true);
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
  res = await main.get_tokens(null, null, res.prev, 3, true);
  console.log(res);
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
