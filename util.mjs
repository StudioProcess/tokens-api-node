import { inspect as _inspect } from 'util';
import crypto from 'crypto';

/**
 * Printable strings from object
 */
_inspect.defaultOptions.depth = null; // unlimited depth
export const inspect = _inspect;

/**
 * Random number
 * Call patterns:
 *   rnd()     -> [0, 1]
 *   rnd(a)    -> [0, a]
 *   rnd(a, b) -> [a, b]
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
export function random_svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" style="stroke:black; stroke-width:10; fill:none;">
  <circle cx="${rnd(1000)}" cy="${rnd(1000)}" r="${rnd(1000/3, 1000)}"/>
  <line x1="${rnd(1000)}" y1="${rnd(1000)}" x2="${rnd(1000)}" y2="${rnd(1000)}"/>
  <line x1="${rnd(1000)}" y1="${rnd(1000)}" x2="${rnd(1000)}" y2="${rnd(1000)}"/>
</svg>`;
}

/**
 * Async sleep
 */
export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ISO timestamp
 * e.g. "2021-04-09T15:26:14.054Z"
 */
export function timestamp() {
  return (new Date()).toISOString();
}
