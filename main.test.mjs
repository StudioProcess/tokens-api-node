import { spawn, fork } from 'child_process';
import tap from 'tap';
import got from 'got';
import * as db from './db.mjs';
import * as util from './util.mjs';

const tokens = [];
const match_id = /[0-9a-f]{32}/; // 32 hex digits
let server_proc;
let server;

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
  
  console.log('starting server');
  const main = await import('./main.mjs');
  server = main.default;
});

tap.teardown(async () => {
  console.log('running teardown:');
  console.log('deleting db ' + db.DB.tokens_db);
  await db.delete_db(db.DB.tokens_db);
  console.log('deleting db ' + db.DB.interactions_db);
  await db.delete_db(db.DB.interactions_db);
  
  console.log('stopping server');
  server.close();
});


tap.test('get token', async t => {
  let res = await got('http://localhost:3000/get_token', {
    responseType: 'json',
    searchParams: { id: tokens[0].id }
  });
  t.same(res.body, tokens[0]);
});

tap.test('get tokens (offset)', async t => {
  let res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:0, count:1 }
  });
  t.same(res.body.offset, 0);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[0]);
  t.same(res.body.prev, null);
  t.same(res.body.next, tokens[1].id);
  t.same(res.body.newest_first, true);
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:1, count:2 }
  });
  t.same(res.body.offset, 1);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[1]);
  t.same(res.body.rows[1], tokens[2]);
  t.same(res.body.prev, tokens[0].id);
  t.same(res.body.next, tokens[3].id);
  t.same(res.body.newest_first, true);
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { offset:tokens.length-1, count:1 }
  });
  t.same(res.body.offset, tokens.length-1);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[tokens.length-1]);
  t.same(res.body.prev, tokens[tokens.length-2].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
});

tap.test('get tokens (from id)', async t => {
  let res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[0].id, count:1 }
  });
  t.same(res.body.offset, 0);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[0]);
  t.same(res.body.prev, null);
  t.same(res.body.next, tokens[1].id);
  t.same(res.body.newest_first, true);
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[4].id, count:3 }
  });
  t.same(res.body.offset, 4);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[4]);
  t.same(res.body.rows[1], tokens[5]);
  t.same(res.body.rows[2], tokens[6]);
  t.same(res.body.prev, tokens[3].id);
  t.same(res.body.next, tokens[7].id);
  t.same(res.body.newest_first, true);
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { start_id:tokens[8].id, count:10 }
  });
  t.same(res.body.offset, 8);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[8]);
  t.same(res.body.rows[1], tokens[9]);
  t.same(res.body.prev, tokens[7].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
});

tap.test('get tokens (until id)', async t => {
  let res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { end_id:tokens[tokens.length-1].id, count:3 }
  });
  t.same(res.body.offset, tokens.length-3);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[tokens.length-3]);
  t.same(res.body.rows[1], tokens[tokens.length-2]);
  t.same(res.body.rows[2], tokens[tokens.length-1]);
  t.same(res.body.prev, tokens[tokens.length-4].id);
  t.same(res.body.next, null);
  t.same(res.body.newest_first, true);
  
  res = await got('http://localhost:3000/get_tokens', {
    responseType: 'json',
    searchParams: { end_id:tokens[5].id, count:2 }
  });
  t.same(res.body.offset, 4);
  t.same(res.body.total_rows, tokens.length);
  t.same(res.body.rows[0], tokens[4]);
  t.same(res.body.rows[1], tokens[5]);
  t.same(res.body.prev, tokens[3].id);
  t.same(res.body.next, tokens[6].id);
  t.same(res.body.newest_first, true);
});
