#!/usr/bin/env node
/* 
  quick script to generate exihition qr codes
*/
import url from 'url';
import { make, verify, save_qr, from_unix_seconds } from './make_jwt.mjs';

function date_str(date) {
  return date.getFullYear() + '-' 
    + String(date.getMonth() + 1).padStart(2, '0') + '-' 
    + String(date.getDate()).padStart(2, '0')
}

export function make_qr(nbf=null, exp=null, filename_prefix='qr ', subject='exhibition', base_url='https://tokensforclimate.care/generate/?auth=') {
  const jwt = make(subject, nbf, exp);
  const payload = verify(jwt);
  console.log(payload);
  if (payload.iat) console.log('iat:', from_unix_seconds(payload.iat));
  if (payload.nbf) console.log('nbf:', from_unix_seconds(payload.nbf));
  if (payload.exp) console.log('exp:', from_unix_seconds(payload.exp));
  console.log(jwt);
  return save_qr(jwt, base_url, nbf, exp, filename_prefix);
}

/*
const BASE_URL = 'https://tokensforclimate.care/generate/?auth=';
const FROM = '2021-05-17';
const DAYS = 45;
const TIMEZONE = "GMT+1";

let date = new Date(FROM);

function date_str(date) {
  return date.getFullYear() + '-' 
    + String(date.getMonth() + 1).padStart(2, '0') + '-' 
    + String(date.getDate()).padStart(2, '0')
}

for (let i=0; i<DAYS; i++) {
  let from = date_str(date) + ' 00:00:00 ' + TIMEZONE;
  date.setDate(date.getDate() + 1);
  let to = date_str(date) + ' 00:01:00 ' + TIMEZONE;
  
  const jwt = make_jwt('exhibition', from, to);
  let url = save_qr(jwt, BASE_URL, from, to);
  console.log(url);
}
*/

function usage() {
  console.log(`Usage:`);
  console.log(`  ./make_qr.mjs --single [ <from> [<to>] ]`);
  console.log(`Examples:`);
  console.log(`  ./make_qr.mjs --single`);
  console.log(`  ./make_qr.mjs --single '2021-10-13 00:00' '2021-12-01 00:00'`);
  console.log();
  console.log(`Usage:`);
  console.log(`  ./make_qr.mjs --daily <from_date> <days> [<timezone>]`);
  console.log(`Examples:`);
  console.log(`  ./make_qr.mjs --daily '2021-05-17' 45 'GMT+1'`);
  console.log(`  ./make_qr.mjs --daily '2021-10-13' 47`);

  process.exit();
}

// if run as script
if ( url.fileURLToPath(import.meta.url) === process.argv[1] ) {
  let args = process.argv.slice(2); // remove first two args (node binary, script path)
  args = args.map(str => str.trim());
  console.log(args);
  
  if (args.length >= 1) {
    if (args[0] == '--single') {
      console.log('single');
      const from = args[1];
      const to = args[2];
      make_qr(from, to);
    }
    else if (args[0] == '--daily') {
      console.log('daily');
      if (args.length < 3) usage();
      
      const from = args[1];
      const days = parseInt(args[2]);
      let  timezone = args[3] ? ' ' + args[3] : '';
      let fallback_from, fallback_to;
      let date = new Date(from);
      for (let i=0; i<days; i++) {
        let from = date_str(date) + ' 00:00' + timezone;
        if (i==0) fallback_from = from;
        date.setDate(date.getDate() + 1);
        let to = date_str(date) + ' 01:00' + timezone;
        fallback_to = to;
        let url = make_qr(from, to);
        console.log(url);
        console.log();
      }
      // generate fallback for whole duration
      console.log(fallback_from, fallback_to);
      let url = make_qr(fallback_from, fallback_to, 'qr whole ');
      console.log(url);
    }
    else {
      usage();
    }
  } else {
    usage();
  }
}