import { inspect as _inspect } from 'util';
import crypto from 'crypto';
import child_process from 'child_process';
import fs from 'fs';

/**
 * Printable strings from object
 */
_inspect.defaultOptions.depth = null; // unlimited depth
export const inspect = _inspect;

/**
 * Random number
 * Call patterns:
 *   rnd()     -> [0, 1)
 *   rnd(a)    -> [0, a)
 *   rnd(a, b) -> [a, b)
 */
export function rnd(a, b) {
  let min = 0;
  let max = 1;
  
  if (b == undefined) {
    if (a != undefined) max = a;
  } else if (a != undefined) {
    min = a;
    max = b;
  }
  
  return min + Math.random() * (max-min);
}

/**
 * Random integer
 * Call patterns:
 *   rnd()     -> [0, 1)
 *   rnd(a)    -> [0, a)
 *   rnd(a, b) -> [a, b)
 */
export function rndint(a, b) {
  return Math.floor( rnd(a,b) );
}

/**
 * Random SHA256 hash
 */
export function rnd_hash(len = 64) {
  const buffer = crypto.randomBytes(32);
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, len);
}


/**
 * Create random SVG
 * Consists of a single circle and two lines.
 */
export function random_svg(custom_attr_str='') {
  const sw = 20; // stroke width
  const r = rnd(125, 500-sw);
  const num_lines = rndint(1, 5);
  function lines(n) {
    let out = '';
    for (let i=0; i<n; i++) {
      out += `  <line x1="${rnd(1000-sw)}" y1="${rnd(1000-sw)}" x2="${rnd(1000-sw)}" y2="${rnd(1000-sw)}"/>\n`;
    }
    return out;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:tfcc="https://tokensforclimate.care" viewBox="0 0 1000 1000" style="stroke:black; stroke-width:${sw}; fill:none;"${custom_attr_str ? ' ' + custom_attr_str : ''}>
  <circle cx="500" cy="500" r="${r}"/>
${lines(rndint(1,5))}
</svg>`;
}

/**
 * Async sleep
 * Note: Not defined async (no need, since it doesn't use await)
 * Async removes cancel method from returned promise.
 */
export function sleep(ms) {
  let _reject;
  let _timeout;
  
  const promise = new Promise( (resolve, reject) => {
    _reject = reject;
    _timeout = setTimeout(resolve, ms);
  });
  
  // add a cancel function to the promise
  promise.cancel = function cancel()  {
    clearTimeout(_timeout);
    _reject();
  };
  
  return promise;
}

/**
 * ISO timestamp
 * e.g. "2021-04-09T15:26:14.054Z"
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Milliseconds after UNIX epoch
 */
export function unix_millis() {
  return new Date().getTime();
}

/**
 * Seconds after UNIX epoch
 */
export function unix_seconds() {
  return Math.floor(unix_millis() / 1000);
}


/**
 * Pick properties from an object
 */
export function pick(obj, props) {
  const out = {};
  for (let prop of props) out[prop] = obj[prop];
  return out;
}

/**
 * Log main properties of request object to console
 */
export function log_req(req) {
  return console.log(pick(req, [
    'method', 'url', 'headers', 'query' 
  ]));
}

/**
 * Log main properties of response object to console
 */
export function log_res(res) {
  return console.log(pick(res, [
    'statusCode', 'statusMessage', 'method', 'url', 'headers', 'body'
  ]));
}

export function git_sha() {
  try {
    return child_process.execSync('git rev-parse HEAD', {encoding:'utf8'}).trim();
  } catch {
    return undefined;
  }
}

/**
 * Timestamp based ids; 1ms resolution
 */
export function short_id() {
  const offset = '2021-05-01';
  const ts = Date.now() - Date.parse(offset); // timestamp
  const full_alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // O and I are excluded
  
  let id = ts.toString(alphabet.length).toUpperCase();
  // map from full alphabet to actual alphabet
  id = id.split('').map(x => {
    let idx = full_alphabet.indexOf(x);
    return alphabet[idx];
  }).join('');
  
  return pad_id(id);
}

export function pad_id(id) {
  return id.padStart(32, '0');
}

export function unpad_id(id) {
  while (id[0] == '0') {
    id = id.slice(1);
  }
  return id;
}

export function id_in(id) {
  return pad_id(id.toUppercase());
}

export function id_out(id) {
  return unpad_id(id);
}
