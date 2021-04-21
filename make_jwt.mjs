#!/usr/bin/env node
// make jwt tokens

import { readFileSync } from 'fs';
import url from 'url';
import jwt from 'jsonwebtoken';
import { unix_seconds } from './util.mjs';

const CONFIG = JSON.parse(readFileSync('./main.config.json'));
const JWT_SECRET = process.env.JWT_SECRET || readFileSync(CONFIG.auth.jwt_secret, {encoding:'utf8'}).trim();

function to_unix_seconds(date_str) {
  return Math.floor(new Date(date_str).getTime() / 1000);
}

export function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, {algorithm:'HS256'})
}

export function verify(token) {
  return jwt.verify(token, JWT_SECRET, {ignoreNotBefore:true, ignoreExpiration:true});
}

// subject, not before, expiration
export function make(sub, nbf = null, exp = null) {
  const payload = {
    sub,
    iat: unix_seconds()
  };
  if (nbf) payload.nbf = to_unix_seconds(nbf);
  if (exp) payload.exp = to_unix_seconds(exp);
  
  if (Number.isNaN(payload.nbf)) throw 'Invalid nbf date';
  if (Number.isNaN(payload.exp)) throw 'Invalid exp date';

  return sign(payload);
}


if ( url.fileURLToPath(import.meta.url) === process.argv[1] ) {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    try {
      const token = make(args[0], args[1], args[2]);
      const payload = verify(token);
      console.log(payload);
      console.log(token);
    } catch (e) {
      console.log(e);
    }
  } else {
    console.log(`Usage: ./make_jwt.mjs subject [not_before] [expiration]`)
  }
}
