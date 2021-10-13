#!/usr/bin/env node
/* 
  quick script to generate exihition qr codes
  for exhibition in mak forum, 10/2021
*/
import { make as make_jwt, save_qr } from './make_jwt.mjs';

const BASE_URL = 'https://tokensforclimate.care/generate/?auth=';
const FROM = '2021-10-13';
const DAYS = 40;
const TIMEZONE = "GMT+2";

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
