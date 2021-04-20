import * as util from './util.mjs';
import * as db from './db.mjs';

export const _db = {};
export let _server;
export let _generator;

export const match_id = /[0-9a-f]{32}/; // 32 hex digits
export const match_color = /#[0-9a-f]{6}/; // hex color

export async function setup_mock_db() {
  console.log('setup mock db:')
  const rnd_id = util.rnd_hash(7);
  _db.tokens_db = db.DB.tokens_db + '-' + rnd_id;
  _db.interactions_db = db.DB.interactions_db + '-' + rnd_id;
  
  console.log('creating db ' + _db.tokens_db);
  await db.create_db(_db.tokens_db);
  
  console.log('creating db ' + _db.interactions_db);
  await db.create_db(_db.interactions_db);
  await util.sleep(500); // will fail if putting immediately
  
  // Set default dbs
  _db.orig_tokens_db = db.DB.tokens_db;
  _db.orig_interactions_db = db.DB.interactions_db;
  db.DB.tokens_db = _db.tokens_db;
  db.DB.interactions_db = _db.interactions_db;
  
  console.log('creating filters');
  await db.create_filters();
  
  // create a bunch of token docs
  console.log('creating tokens');
  _db.tokens = [];
  for (let i=0; i<10; i++) {
    const token = {
      svg: util.random_svg(),
      generated: util.timestamp(),
      offset: i
    };
    const res = await db.put_token(token);
    token.id = res.id;
    _db.tokens.push(token);
  }
  _db.tokens.reverse();
  return _db.tokens;
}

export async function teardown_mock_db() {
  console.log('teardown mock db:');
  // Reset default dbs
  db.DB.tokens_db = _db.orig_tokens_db;
  db.DB.interactions_db = _db.orig_interactions_db;
  
  console.log('deleting db ' + _db.tokens_db);
  await db.delete_db(_db.tokens_db);
  console.log('deleting db ' + _db.interactions_db);
  await db.delete_db(_db.interactions_db);
  
  await cleanup_mock_dbs();
}

export async function cleanup_mock_dbs() {
  console.log('cleanup mock dbs:');
  let dbs = await db.all_dbs();
  dbs = dbs.filter( db => (/-[0-9a-f]{7}/).test(db) );
  if (dbs.length == 0) {
    console.log('all clean');
    return;
  }
  console.log('deleting dbs', dbs.join(', '));
  const deletes = dbs.map(db.delete_db);
  return Promise.all(deletes);
}

export async function start_server() {
  console.log('starting server');
  const main = await import('./main.mjs');
  _server = main.default;
  return _server;
}

export function stop_server() {
  console.log('stopping server');
  _server.close(0);
}

export async function start_generator() {
  console.log('starting mock generator');
  _generator = await import('./mock-generator.mjs');
  _generator.CONFIG.display_time = 1500;
  return _generator;
}

export function stop_generator() {
  console.log('stopping mock generator');
  _generator.stop();
}
