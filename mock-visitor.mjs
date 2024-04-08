#!/usr/bin/env node

// Deposit a mock interaction and wait for all updates until token is received

import { readFileSync } from 'fs';
import { sleep, rndint } from './util.mjs';
import { request } from './test_util.mjs';
import * as make_jwt from './make_jwt.mjs';

const AUTH_TOKEN = make_jwt.make('exhibition'); // create valid auth token with subject 'exhibition'
const KEYWORDS = JSON.parse(readFileSync('./config/keywords.json'));

export const CONFIG = {
  deposit_delay: 1000, // how long to wait before depositing a newly requested interaction
  update_timeout: 5000, // timeout for /interaction_updates
};

function log_error(e) {
  if (e.code) {
    console.log(e.code);
  } else if (e.response) {
    console.log(e.response.statusCode);
    console.log(e.response.body);
  } else {
    console.log(e);
  }
}

async function interact() {
  console.log('requesting interaction')
  try {
    const res = await request('/request_interaction', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
      responseType: 'json',
    });
    const int = res.body;
    console.log('got interaction', int);
    
    console.log('selecting keywords...');
    const keywords = [ KEYWORDS[rndint(KEYWORDS.length)], KEYWORDS[rndint(KEYWORDS.length)], KEYWORDS[rndint(KEYWORDS.length)] ];
    const deposit = { id: int.id, keywords: keywords.join(',') };
    await sleep(2000);
    
    console.log('depositing interaction', deposit);
    const res2 = await request('/deposit_interaction', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
      searchParams: deposit,
      responseType: 'json',
    });
    
    console.log('listening for updates...');
    let seq = 0;
    let done = false;
    while (!done) {
      try {
        const res3 = await request('/interaction_updates', {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
          searchParams: { id: deposit.id, since: seq, timeout:CONFIG.update_timeout },
          responseType: 'json',
        });
        const update = res3.body;
        console.log('update:', update);
        seq = update.seq;
        if (update.queue_position == 0) done = true;
      } catch (e) {
        if (e.response?.statusCode == 504) console.log('waiting...');
        // 504 timeout
      }
    }
    
    console.log('done');
    
  } catch (e) {
    log_error(e);
  }
}

interact();
