import { readFileSync } from 'fs';
import got from 'got';
import { random_svg, sleep, timestamp, inspect } from './util.mjs';

const MAIN_CONFIG = JSON.parse(readFileSync('./main.config.json'));
export const CONFIG = {
  loop_time: 500, // when queue is empty
  display_time: 15000
};

const queue = [];
let seq = 0;

let should_stop = false;
let interaction_update_request; // cancelable got promise
let generator_sleep; // cancelable util.sleep promise

// Note: Not defined async (no need, since it doesn't use await). Async removes cancel method from returned promise
function request(method='get', path='', options={}) {
  options = Object.assign({
    method,
    responseType: 'json'
  }, options);
  return got(`http://${MAIN_CONFIG.host}:${MAIN_CONFIG.port}${path}`, options);
}


// perpetually handle new interactions; fills the queue, notifies of initial queue position
async function handle_new_interactions() {
  interaction_update_request = request('get', '/get_new_interaction_updates', {
    searchParams: {since: seq}
  });
  let res;
  try {
    res = await interaction_update_request;
  } catch (e) {
    if (e instanceof got.CancelError) return;
    throw e;
  }
  const int = res.body;
  seq = int.seq;
  delete int.rev;
  delete int.seq;
  int.queue_position = queue.length + 1;
  queue.push( int ); // add interaction to queue;
  console.log('new interaction:', int);
  // notify of queue position
  res = await request('get', '/update_interaction', {
    searchParams: { id: int.id, queue_position: int.queue_position }
  });
  console.log('new interaction queue position notified:', int.queue_position);
  
  if (!should_stop) handle_new_interactions();
}

async function generate() {
  // take first item in queue
  const int = queue.shift();
  if (int != null) {
    console.log('generating for:', int.id);
    // generate new token
    const ts = timestamp();
    const svg = random_svg(`tfcc:keywords="${int.keywords.join(',')}" tfcc:generated="${ts}"`);
    const token = {
      generated: ts,
      keywords: int.keywords,
      svg,
    };
    const res = await request('put', '/put_token', {
      json: token
    });
    const id = res.body.id;
    console.log('generated token:', id);
    
    // update all queueing interactions
    const updates = [];
    updates.push(request('get', '/update_interaction', {
      searchParams: { id: int.id, queue_position: 0, token_id: id }
    }));
    
    queue.forEach( (int, idx) => {
      updates.push(request('get', '/update_interaction', {
        searchParams: { id: int.id, queue_position: idx + 1 }
      }));
    });
    
    await Promise.all(updates);
    console.log('queue positions notified, queue length:', queue.length);
    
    // simulated installation display of generated token
    generator_sleep = sleep( Math.max(CONFIG.display_time, CONFIG.loop_time) );
  } else {
    // wait
    generator_sleep = sleep(CONFIG.loop_time);
  }
  try {
    await generator_sleep;
  } catch (e) {
    return;
  }
  
  // loop
  if (!should_stop) generate();
}


export function stop() {
  should_stop = true;
  if (interaction_update_request) interaction_update_request.cancel();
  if (generator_sleep) generator_sleep.cancel();
}


(async function main() {
  
  handle_new_interactions();
  
  generate();
  
  console.log('Mock Generator running');
  
})();
