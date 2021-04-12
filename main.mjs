#!/usr/bin/env node

import {readFileSync} from 'fs';
import express from 'express';
import * as db from './db.mjs';
import { log_req } from './util.mjs';

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

app.all('*', parse_query);


app.get('/get_token', async (req, res) => {
  try {
    const token = await db.get_single_token(req.query.id);
    res.json(token);
  } catch (e) {
    // console.log(e);
    res.status(400).json(e);
  }
});


app.get('/get_tokens', async (req, res) => {
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
    // console.log(e);
    res.status(400).json(e);
  }
});


// app.get('/put_token', async (req, res) => {
// });
// 
// app.get('/delete_token', async (req, res) => {
// });


const server = app.listen(CONFIG.port, () => {
  console.log('Server running on port ' + CONFIG.port);
});

// Instance of http.Server. See: https://expressjs.com/en/4x/api.html#app.listen
export default server;
