#!/usr/bin/env node

// Command line tool to add and delete tokens, or wipe db (tokens + interactions)
// Intended to be run directly on the server (no networking)

import { readFileSync } from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import * as db from './db.mjs';
import * as util from './util.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const CONFIG = JSON.parse(readFileSync('./config/main.config.json'));
const DB = JSON.parse(readFileSync(CONFIG.db_config));
const KEYWORDS = JSON.parse(readFileSync('./config/keywords.json'));
const EXPORT_BATCH = 1000;
const EXPORT_TMP_DIR = '.tmp/';

let args = process.argv.slice(2); // 0 .. node, 1 .. module
args = args.map( str => str.toLowerCase() );

const script = path.basename( process.argv[1] );

function exit() {
  rl.close();
  process.exit();
}

function usage() {
  console.log(`Usage: ${script} 
    add <num>
    delete <id> [ <id> ... ]
    export
    wipe-tokens
    wipe-interactions
    wipe-all`);
  exit();
}

if (args.length == 0) usage();

if (args[0] == 'add') {
  if (!args[1]) {
    console.log('need <num> number of tokens to generate');
    usage();
  }
  const num = parseInt(args[1]);
  if (Number.isNaN(num)) usage();
  console.log(`creating ${num} mock tokens:`);
  for (let i=0; i<num; i++) {
    if (i>0) await util.sleep(1);
    process.stdout.write( (i+1) + '...' );
    const keywords = [ KEYWORDS[util.rndint(KEYWORDS.length)], KEYWORDS[util.rndint(KEYWORDS.length)], KEYWORDS[util.rndint(KEYWORDS.length)] ];
    const generated = util.timestamp();
    const res = await db.put_token({
      svg: util.random_svg(`tfcc:generated="${generated}" tfcc:keywords="${keywords.join(',')}"`),
      generated,
      keywords
    });
    console.log(res.id);
  }
  exit();
} else if (args[0] == 'delete') {
  if (!args[1]) {
    console.log('need <id> id or ids to delete');
    usage();
  }
  const arg = args.slice(1).join(','); // join all remaining args
  const ids = arg.split(',').filter(str => str != '').map(str => str.trim().toLowerCase());
  rl.question(`Are you sure you want to delete ${ids.length} token(s): \n${ids.join('\n')}\n? `, async response => {
    if (!response.toLowerCase() == 'yes') {
      console.log('Aborting.');
      exit();
    }
    rl.close();
    for (let id of ids) {
      try {
        process.stdout.write(`deleting ${id}...`);
        await db.delete_token(id);
        console.log('OK');
      } catch (e) {
        console.log(e.response.body);
      }
    }
  });
} else if (args[0] == 'export') {
    const json_dir = EXPORT_TMP_DIR + '/json';
    const svg_dir  = EXPORT_TMP_DIR + '/svg';
    util.rmdir(json_dir); util.rmdir(svg_dir);
    util.mkdir(json_dir); util.mkdir(svg_dir);
    
    let is_first_batch = true;
    let pad_len = 32; // maximum pad length
    
    try {
      let res = null;
      while (!res || res.next != null) {
        if (!res) {
          res = await db.get_tokens(0, null, null, EXPORT_BATCH);
        } else {
          res = await db.get_tokens(null, res.next, null, EXPORT_BATCH);
        }
        // determine pad length (first batch only)
        if (is_first_batch) { 
          if (res.rows.length > 0) {
            pad_len = res.rows[0].id.length; // this is the latest token i.e. the longest
          }
        }
        // console.log(res);
        console.log(`retrieved batch of ${res.rows.length} tokens...`);
        for (let token of res.rows) {
          const id = token.id.toUpperCase().padStart(pad_len, '0');
          util.save_json( `${json_dir}/${id}.json`, token);
          util.save_text( `${svg_dir}/${id}.svg`, token.svg);
        }
        is_first_batch = false;
      }
      let ts = util.timestamp().replace(/[Z:]/g, '').replace(/[T\.]/g, '-');
      let zipfile = `export-${ts}.zip`
      util.zip(EXPORT_TMP_DIR, zipfile);
      util.rmdir(EXPORT_TMP_DIR);
      console.log(`created ${zipfile}`);
    } catch (e) {
      console.log('error: ', e.response.body);
    }
    exit();
} else if (args[0] == 'wipe-all') {
  const challenge = os.hostname() + '-all-' + util.rnd_hash(4).toUpperCase();
  rl.question(`WARNING: You are about to wipe ALL TOKENS and INTERACTIONS from the database on ${os.hostname()}! To confirm type \'${challenge}\': `, async response => {
    if (response !== challenge) {
      console.log('Aborted.');
      exit();
    }
    rl.close();
    console.log('Wiping:');
    
    process.stdout.write(`deleting ${DB.tokens_db}...`);
    try {
      await db.delete_db(DB.tokens_db);
      console.log('OK');
    } catch (e) {
      console.log('error: ', e.response.body);
    }
    
    process.stdout.write(`deleting ${DB.interactions_db}...`);
    try {
      await db.delete_db(DB.interactions_db);
      console.log('OK');
    } catch (e) {
      console.log('error: ', e.response.body);
    }
    
    console.log('creating dbs...');
    await db.create_db(DB.tokens_db);
    await db.create_db(DB.interactions_db);
    
    console.log('creating design doc...');
    await db.create_design_docs();
  });
} else if (args[0] == 'wipe-tokens') {
  const challenge = os.hostname() + '-tokens-' + util.rnd_hash(4).toUpperCase();
  rl.question(`WARNING: You are about to wipe ALL TOKENS from the database on ${os.hostname()}! To confirm type \'${challenge}\': `, async response => {
    if (response !== challenge) {
      console.log('Aborted.');
      exit();
    }
    rl.close();
    console.log('Wiping:');
    
    process.stdout.write(`deleting ${DB.tokens_db}...`);
    try {
      await db.delete_db(DB.tokens_db);
      console.log('OK');
    } catch (e) {
      console.log('error: ', e.response.body);
    }
    
    console.log('creating db...');
    await db.create_db(DB.tokens_db);
    
  });
} else if (args[0] == 'wipe-interactions') {
  const challenge = os.hostname() + '-interactions-' + util.rnd_hash(4).toUpperCase();
  rl.question(`WARNING: You are about to wipe ALL INTERACTIONS from the database on ${os.hostname()}! To confirm type \'${challenge}\': `, async response => {
    if (response !== challenge) {
      console.log('Aborted.');
      exit();
    }
    rl.close();
    console.log('Wiping:');
    
    process.stdout.write(`deleting ${DB.interactions_db}...`);
    try {
      await db.delete_db(DB.interactions_db);
      console.log('OK');
    } catch (e) {
      console.log('error: ', e.response.body);
    }
    
    console.log('creating db...');
    await db.create_db(DB.interactions_db);
    
    console.log('creating design doc...');
    await db.create_design_docs();
  });
} else {
  usage();
}
