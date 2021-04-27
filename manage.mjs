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

let args = process.argv.slice(2); // 0 .. node, 1 .. module
args = args.map( str => str.toLowerCase() );

const script = path.basename( process.argv[1] );

function usage() {
  console.log(`Usage: ${script} 
    add <num>
    delete <id> [ <id> ... ]
    wipe`);
  process.exit();
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
    process.stdout.write( (i+1) + '...' );
    const keywords = [ KEYWORDS[util.rndint(KEYWORDS.length)], KEYWORDS[util.rndint(KEYWORDS.length)], KEYWORDS[util.rndint(KEYWORDS.length)] ];
    const generated = util.timestamp();
    const res = await db.put_token({
      svg: util.random_svg(`tfcc-generated="${generated}" tfcc-keywords="${keywords.join(',')}"`),
      generated,
      keywords
    });
    console.log(res.id);
  }
} else if (args[0] == 'delete') {
  if (!args[1]) {
    console.log('need <id> id or ids to delete');
    usage();
  }
  const arg = args.slice(1).join(','); // join all remaining args
  const ids = arg.split(',').filter(str => str != '').map(str => str.trim());
  rl.question(`Are you sure you want to delete ${ids.length} token(s): \n${ids.join('\n')}\n? `, async response => {
    if (!response.toLowerCase() == 'yes') {
      console.log('Aborting.');
      rl.close();
      process.exit();
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
  
} else if (args[0] == 'wipe') {
  const challenge = os.hostname() + '-' + util.rnd_hash(6).toUpperCase();
  rl.question(`WARNING: You are about to wipe ALL tokens and interactions from the database on ${os.hostname()}! To confirm type \'${challenge}\': `, async response => {
    if (response !== challenge) {
      console.log('Aborted.');
      rl.close();
      process.exit();
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
} else {
  usage();
}
