#!/usr/bin/env node

import {readFileSync} from 'fs';
import express from 'express';
import * as db from './db.mjs';
import { log_req, pick } from './util.mjs';

const CONFIG = JSON.parse(readFileSync('./main.config.json'));

const app = express();

// const roles = {
//   'installation': 
//   'web': 
//   'visitor': 
// };

export function parse_query_val(str) {
  // integer
  let val = Number(str);
  if ( !isNaN(val) && val != Infinity ) {
    return val;
  }
  
  // boolean
  let lower = str.toLowerCase();
  if (lower == 'true') return true;
  if (lower == 'false') return false;
  
  // other
  return str;
}

function parse_query(req, res, next) {
  for (let [key, val] of Object.entries(req.query)) {
    req.query[key] = parse_query_val(val);
  };
  next();
}

function other_error(res, e) {
  // got.js errors. See: https://www.npmjs.com/package/got#errors
  if (e.name == 'RequestError') {
    if (e.code == 'ECONNREFUSED') {
      // 503 service unavailable
      res.status(503).json({error: 'db down'}); 
      return;
    }
    res.status(500).json({ error: 'db request error', code: e.code });
    return;
  }
  
  if (e.name == 'HTTPError') {
    res.status(500).json({ 
      error: 'db http error', 
      statusCode: e.response?.statusCode, 
      statusMessage: e.response?.statusMessage });
    return;
  }
  
  if (['CacheError', 'ReadError', 'ParseError', 
    'UploadError', 'MaxRedirectsError', 'UnsupportedProtocolError', 
    'TimeoutError', 'CancelError'].includes(e.name)) {
    res.status(500).json({ error: 'db error', name: e.name });
    return;
  }
  
  // other errors (node)
  res.status(500).json({ error: 'other error', error_obj: pick(e, ['name', 'code', 'message', 'stack']) });
  return;
}

app.all('*', parse_query);


app.get('/get_token', async (req, res) => {
  // no id (null, undefined, '')
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  
  try {
    const token = await db.get_single_token(req.query.id);
    res.json(token);
  } catch (e) {
    // 404 object not found
    if (e.response?.statusCode == 404) {
      res.status(404).json({error: 'token not found'}) ;
      return;
    }
    other_error(res, e);
  }
});


app.get('/get_tokens', async (req, res) => {
  if (req.query.offset == undefined && req.query.start_id == undefined && req.query.end_id == undefined) {
    res.status(400).json({error: 'need offset, start_id or end_id'});
    return;
  }
  
  if (req.query.count <= 0 || req.query.count > CONFIG.page_limit) {
    res.status(400).json({error: 'count out of range'});
    return;
  }
  
  try {
    const tokens = await db.get_tokens(
      req.query.offset,
      req.query.start_id,
      req.query.end_id,
      req.query.count,
      req.query.newest_first,
    );
    res.json(tokens);
  } catch (e) {
    if (e.error == 'offset out of range') {
      res.status(400).json(e);
      return;
    }
    other_error(res, e);
  }
});


// app.get('/put_token', async (req, res) => {
// });
// 
// app.get('/delete_token', async (req, res) => {
// });


app.get('/request_interaction', async (req, res) => {
  try {
    const int = await db.request_interaction();
    res.json(int);
  } catch (e) {
    other_error(res, e);
  }
});

app.get('/deposit_interaction', async (req, res) => {
  try {
    let keywords = req.query.keywords;
    keywords = keywords.toLowerCase();
    keywords = keywords.split(/[\.,;/]/, 3);
    await db.deposit_interaction(req.query.id, keywords);
    res.end();
  } catch (e) {
    console.log(e);
    other_error(res, e);
  }
});

app.get('/get_single_interaction_updates', async (req, res) => {
  try {
    const int = await db.get_single_interaction_updates(req.query.id, req.query.since);
    res.json(int);
  } catch (e) {
    other_error(res, e);
  }
});

app.get('/get_new_interaction_updates', async (req, res) => {
  try {
    const int = await db.get_new_interaction_updates(req.query.since);
    res.json(int);
  } catch (e) {
    other_error(res, e);
  }
});

app.get('/update_interaction', async (req, res) => {
  try {
    const int = await db.update_interaction(req.query.id, req.query.queue_position, req.query.token_id);
    res.end();
  } catch (e) {
    other_error(res, e);
  }
});


// db check
const db_status = await db.check_dbs();
if ( Object.values(db_status).some(x => x == false) ) {
  console.error('dbs not ready', db_status);
  process.exit();
}
// filter check
const filter_status = await db.check_filters();
if (!filter_status) {
  await db.create_filters();
  console.log('updated filters');
}
// start server
const server = app.listen(CONFIG.port, () => {
  console.log('Server running on port ' + CONFIG.port);
});

// Instance of http.Server. See: https://expressjs.com/en/4x/api.html#app.listen
export default server;
