#!/usr/bin/env node
/* 
  generate exihition qr codes
  used 2021-10: 
    # for exhibition at MAK forum
    ./make_qr.mjs --daily '2021-10-13' 47
    # no expiration:
    ./make_qr.mjs --single
  used 2022-02:
    # for exhibition at AIT
    ./make_qr.mjs --single '2022-02-20 00:00' '2022-10-01 00:00'
  used 2022-05:
    # for swiss media design day talk
    ./make_qr.mjs --single '2022-05-10 00:00' '2022-05-16 00:00'
    ./make_qr.mjs --single '2022-05-10 00:00' '2022-05-23 00:00'
  used 2022-11:
    # for fh salzburg gastvvortrag
    ./make_qr.mjs --single '2022-11-29 00:00' '2022-12-07 00:00'
  used 2022-11:
    # for supsi mendrisio
    ./make_qr.mjs --single '2022-12-13 00:00' '2022-12-20 00:00'
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
  // console.log(args);
  
  if (args.length >= 1) {
    if (args[0] == '--single') {
      console.log('single');
      const from = args[1];
      const to = args[2];
      let url = make_qr(from, to);
      console.log(url);
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