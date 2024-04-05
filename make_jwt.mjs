#!/usr/bin/env node
// make jwt tokens

import { readFileSync, appendFileSync, writeFileSync } from 'fs';
import url from 'url';
import jwt from 'jsonwebtoken';
import { unix_seconds } from './util.mjs';
import qrcode from 'qrcode';

const CONFIG = JSON.parse(readFileSync('./config/main.config.json'));
const JWT_SECRET = process.env.JWT_SECRET || readFileSync(CONFIG.auth.jwt_secret, {encoding:'utf8'}).trim();

/* 
  date string examples:
  '2021-05-17'                // uses UTC 00:00:00
  '2021-05-17 00:00:00'       // uses local timezone
  '2021-05-17 00:00:00 GMT+1' // explicit timezone
  '2021-05-17 00:00:00 GMT'
*/ 
export function to_unix_seconds(date_str) {
  return Math.floor(new Date(date_str).getTime() / 1000);
}

export function from_unix_seconds(ts) {
  return new Date(ts * 1000);
}

export function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, {algorithm:'HS256'})
}

export function verify(token) {
  return jwt.verify(token, JWT_SECRET, {ignoreNotBefore:true, ignoreExpiration:true});
}

// subject, not before, expiration
// nbf, exp: (both optional) date strings to be parsed with new Date() (see to_unix_seconds())
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

// Note: nbf_string, exp_string: date strings only used in filename of QR code SVG.
export function save_qr(jwt, base_url='', nbf_string=null, exp_string=null, filename_prefix='qr ', type='svg') {
  const payload = verify(jwt);
  let f = filename_prefix;
  if (payload.sub != undefined) f += payload.sub;
  if (payload.nbf != undefined) f += ' from ' + (nbf_string || payload.nbf);
  if (payload.exp != undefined) f += ' to ' + (exp_string || payload.nbf);
  f = f.trim();
  f = f.replace(/:/g, '-');
  let url = base_url + jwt;
  if (type == 'txt') {
    writeFileSync(f + '.txt', `${url}`);
  } else if (type == 'transparent-png') {
    qrcode.toFile(f + ' transparent.png', url, {type:'png', width:2160, color:{ dark:"#000", light:"#0000" }});
  } else if (type == 'png') {
    qrcode.toFile(f + '.png', url, {type:'png', width:2160 });
  } else {
    qrcode.toFile(f + '.svg', url, {type:'svg'}, (err) => {
      if (!err) {
        appendFileSync(f + '.svg', `<!--\n${url}\n-->\n`); // add url to svg (as comment)
      }
    });
  }
  return url;
}


// if run as script
if ( url.fileURLToPath(import.meta.url) === process.argv[1] ) {
  let args = process.argv.slice(2);
  args = args.map(str => str.trim());
  
  let qr = false;
  let base_url = '';
  let idx = args.findIndex( str => str == '--qr');
  if (idx !== undefined) {
    qr = true;
    if (idx+1 <= args.length-1) base_url = args[idx+1];
    args.splice(idx, 2);
  }
  
  if (args.length > 0) {
    try {
      const token = make(args[0], args[1], args[2]);
      const payload = verify(token);
      console.log(payload);
      console.log(token);
      if (qr) {
        save_qr(token, base_url, args[1], args[2]);
      }
    } catch (e) {
      console.log(e);
    }
  } else {
    console.log(`Usage: ./make_jwt.mjs <subject> [ <not_before> [<expiration>] ] [--qr <base_url>]`);
console.log(`Example: 
  ./make_jwt.mjs exhibition '2021-10-13 00:00:00' '2021-10-23 00:00:00' --qr 'https://tokensforclimate.care/generate/?auth='`);
  }
}
