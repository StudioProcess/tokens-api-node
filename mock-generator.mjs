#!/usr/bin/env node
import { readFileSync } from 'fs';
import got from 'got';
import { random_svg, sleep, timestamp, inspect } from './util.mjs';
import { request } from './test_util.mjs';
import * as make_jwt from './make_jwt.mjs';

export const CONFIG = {
  loop_time: 500, // how fast to check for items in the queue
  initial_delay: 5000, // when queue is empty
  display_time: 15000,
  longpoll_timeout: process.env.LONGPOLL_TIMEOUT || 60000
};

const AUTH_TOKEN = make_jwt.make('generator'); // create valid auth token with subject 'generator'

const queue = [];
let seq = 0; // sequence number for /new_interaction_updates

let should_stop = false;
let interaction_update_request; // cancelable got promise
let generator_sleep; // cancelable util.sleep promise

// perpetually handle new interactions; fills the queue, notifies of initial queue position
async function handle_new_interactions() {
  interaction_update_request = request('/new_interaction_updates', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
    responseType: 'json',
    searchParams: {since: seq, timeout: CONFIG.longpoll_timeout},
    retry: 0
  });
  try {
    let res = await interaction_update_request;
    const int = res.body;
    console.log('new interaction:', int);
    seq = int.seq;
    delete int.seq;
    int.queue_position = queue.length + 1;
    // update queue position
    res = await request('/update_interaction', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
      responseType: 'json',
      searchParams: { id: int.id, queue_position: int.queue_position }
    });
    console.log('initial queue position', int.queue_position, 'for interaction', int.id);
    // add to processing queue AFTER the update (otherwise update conflicts could happen)
    queue.push( int );
    if (!should_stop) handle_new_interactions();
  } catch (e) {
    if (interaction_update_request.isCanceled) return; // exit handler loop when request was canceled
    
    if (e.response?.statusCode == 504) { // timeout
      if (!should_stop) handle_new_interactions();
      return;
    }
    
    // other errors
    let error = e.code || e.response?.body || e;
    console.log('error when waiting for new interactions:', error);
    console.log('continuing...');
    await sleep(1000);
    if (!should_stop) handle_new_interactions();
  }
}

async function generate() {
  // take first item in queue
  const int = queue.shift();
  if (int != null) {
    if (queue.length == 0) await sleep(CONFIG.initial_delay);
    
    console.log('generating for:', int.id);
    // generate new token
    const ts = timestamp();
    const svg = random_svg(`tfcc:keywords="${int.keywords.join(',')}" tfcc:generated="${ts}"`);
    const token = {
      generated: ts,
      keywords: int.keywords,
      svg,
    };
    const res = await request('/token', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
      responseType: 'json',
      method: 'put',
      json: token
    });
    const id = res.body.id;
    console.log('generated token:', id);
    
    // update all queueing interactions
    const updates = [];
    // this one is done
    updates.push(request('/update_interaction', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
      responseType: 'json',
      searchParams: { id: int.id, queue_position: 0, token_id: id },
      retry: 0
    }));
    // these move up in the queue
    queue.forEach( (int, idx) => {
      updates.push(request('/update_interaction', {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}`},
        responseType: 'json',
        searchParams: { id: int.id, queue_position: idx + 1 },
        retry: 0,
      }));
    });
    
    try {
      await Promise.all(updates);
      console.log('queue positions notified, queue length:', queue.length);
    } catch (e) {
      let error = e.code || e.response?.body || e;
      console.log('error while generating token:', error);
      console.log('quitting.');
      process.exit(1);
    }
    
    // simulated installation display of generated token
    generator_sleep = sleep( Math.max(CONFIG.display_time, CONFIG.loop_time) );
  } else {
    // wait
    generator_sleep = sleep(CONFIG.loop_time);
  }
  try {
    await generator_sleep;
  } catch (e) {
    // canceled
    return; // stop generating
  }
  
  // loop
  if (!should_stop) generate();
}


export function stop() {
  should_stop = true;
  if (interaction_update_request) interaction_update_request.cancel();
  if (generator_sleep) generator_sleep.cancel();
}

async function api_online() {
  try {
    let res = await request('/', { responseType: 'json' });
    return res.statusCode == 200;
  } catch (e) {
    return false;
  }
}


(async function main() {
  if (! await api_online()) {
    console.log('waiting for tokens api...')
    await sleep(3000);
    if (! await api_online()) {
      console.log('tokens api not online: exiting');
      process.exit(1);
    };
  }
  
  handle_new_interactions().catch(e => {
    console.log('uncaught error while handling interactions:', e);
    console.log('quitting.');
    process.exit(1);
  });
  
  generate().catch(e => {
    console.log('uncaught error while generatig:', e);
    console.log('quitting.');
    process.exit(1);
  });
  
  console.log('Mock Generator running');
  
})();
