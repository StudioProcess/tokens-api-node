#!/usr/bin/env node
import http from 'http';
import https from 'https';
import { readFileSync } from 'fs';
import express from 'express';
import { expressjwt as jwt } from 'express-jwt';
import cors from 'cors';
import * as db from './db.mjs';
import { pick, sleep, git_sha, svg_width } from './util.mjs';
import sharp from 'sharp';

export const CONFIG = JSON.parse(readFileSync('./config/main.config.json'));
const JWT_SECRET = process.env.JWT_SECRET || readFileSync(CONFIG.auth.jwt_secret, {encoding:'utf8'}).trim();
const PACKAGE_JSON = JSON.parse(readFileSync('./package.json'));
const GIT_SHA = git_sha();
export const DB = db; // for testing. make db module accessible, so config can be changed

const app = express();

// CORS configuration. See: https://github.com/expressjs/cors#configuration-options
app.use(cors(CONFIG.cors));

// middleware to require jwt subjects
function require_sub(...subs) {
  return [
    // decode "Authorization: Bearer" on all requests and place a 'user' object on req
    jwt({ secret: JWT_SECRET, algorithms: ['HS256'] }),
    // handle jwt validation errors (not called if no error occurs)
    function (err, req, res, next) {
      if (err.name == 'UnauthorizedError') {
        // check allowlist
        if (CONFIG.auth.allow && req.headers.authorization) {
            // extract encoded token
            let auth = req.headers.authorization.match(/(?:Bearer )(.*)/);
            if (auth !== null) { auth = auth[1]; }
            // check list
            if (auth && CONFIG.auth.allow.includes(auth)) {
                res.auth = { allow: true };
                next();
                return;
            }
        }
        // ignore auth errors if auth is globally disabled or no subjects required
        if (CONFIG.auth.enabled === false || subs.length == 0) { 
          next(); 
          return; 
        }
        if (err.inner?.name == 'NotBeforeError') {
          res.status(401).json({'error': 'token not yet active'});
          return;
        }
        if (err.inner?.name == 'TokenExpiredError') {
          res.status(401).json({'error': 'token expired'});
          return;
        }
        // other errors (missing auth, invalid signature, malformed token)
        res.status(401).json({'error': 'invalid auth'});
        return;
      }
      next();
    },
    // no jwt errors, check subject
    function (req, res, next) {
      // pass if on allowlist
      if (res.auth && res.auth.allow === true) { next(); return; }
      // pass if auth is disabled or no subjects are required
      if (CONFIG.auth.enabled === false || subs.length == 0) { next(); return; }
      // check if token subject is one of the required subjects
      // console.log('got sub:', req.auth.sub);
      if ( !subs.includes(req.auth.sub) ) {
        res.status(403).json({'error': 'wrong subject'});
        return;
      }
      // check if subject isn't expired (issued at or after latest issue date for the role)
      // doesn't apply if no issued_at is defined for a subject
      if ( req.auth.iat < CONFIG.auth.subject_issued_at[req.auth.sub] ) {
        res.status(403).json({'error': 'subject expired'});
        return;
      }
      next();
    }
  ];
}


// middleware to parse query values (numbers or boolean)
function parse_query_val(str) {
  if (typeof str != 'string') return str; // catch undefined, null etc.
  if (str === '') return str; // special case for empty string, because Number('') -> 0
  
  // integer
  let val = Number(str);
  if ( !isNaN(val) && val != Infinity ) {
    return val;
  }
  
  // boolean
  let lower = str.toLowerCase();
  if (lower == 'true') return true;
  if (lower == 'false') return false;
  
  // other
  return str;
}
function parse_query(req, res, next) {
  for (let [key, val] of Object.entries(req.query)) {
    req.query[key] = parse_query_val(val);
  };
  next();
}
app.use(parse_query);


function other_error(res, e) {
  // got.js errors. See: https://www.npmjs.com/package/got#errors
  if (e.name == 'RequestError') {
    if (e.code == 'ECONNREFUSED') {
      // 503 service unavailable
      res.status(503).json({error: 'db down'}); 
      return;
    }
    res.status(500).json({ error: 'db request error', code: e.code });
    return;
  }
  
  if (e.name == 'HTTPError') {
    res.status(500).json({ 
      error: 'db http error', 
      statusCode: e.response?.statusCode, 
      statusMessage: e.response?.statusMessage });
    return;
  }
  
  if (['CacheError', 'ReadError', 'ParseError', 
    'UploadError', 'MaxRedirectsError', 'UnsupportedProtocolError', 
    'TimeoutError', 'CancelError'].includes(e.name)) {
    res.status(500).json({ error: 'db error', name: e.name });
    return;
  }
  
  // other errors ( {error} )
  if (e.error) {
    res.status(500).json({ error: 'other error', error_obj: e });
    return;
  }
  
  // other errors (node)
  res.status(500).json({ error: 'other error', error_obj: pick(e, ['name', 'code', 'message', 'stack']) });
  return;
}


app.get('/', async (req, res) => {
  res.json({
    name: PACKAGE_JSON.name,
    description: PACKAGE_JSON.description,
    version: PACKAGE_JSON.version,
    git_sha: GIT_SHA
  });
});

app.get('/token', require_sub(), async (req, res) => {
  // no id (null, undefined, '')
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  
  try {
    const token = await db.get_single_token(req.query.id);
    res.json(token);
  } catch (e) {
    // 404 object not found
    if (e.response?.statusCode == 404) {
      res.status(404).json({error: 'token not found'}) ;
      return;
    }
    other_error(res, e);
  }
});

app.get('/svg', async (req, res) => {
  // no id (null, undefined, '')
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  
  try {
    const token = await db.get_single_token(req.query.id);
    if (req.query.download != undefined) {
      res.attachment(`token-${token.id}.svg`);
      res.type('application/octet-stream');
    } else {
      res.type('image/svg+xml');
    }
    res.send(token.svg);
  } catch (e) {
    // 404 object not found
    if (e.response?.statusCode == 404) {
      res.status(404).json({error: 'token not found'}) ;
      return;
    }
    other_error(res, e);
  }
});

app.get('/png', async (req, res) => {
  // no id (null, undefined, '')
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  
  try {
    const token = await db.get_single_token(req.query.id);
    
    let density = 72;
    const width = svg_width(token.svg); // try to extract svg width from viewbox attribute
    if (width) density = CONFIG.png.render_size / width * 72;
    let sharp_obj = await sharp( Buffer.from(token.svg), {density} );
    if ( !['', 'none', 'transparent'].includes(CONFIG.png.background_color) )
      sharp_obj = await sharp_obj.flatten({background: CONFIG.png.background_color})
    const png_data = await sharp_obj.png().toBuffer();

    if (req.query.download != undefined) {
      res.attachment(`token-${token.id}.png`);
      res.type('application/octet-stream');
    } else {
      res.type('image/png');
    }
    res.send(png_data);
  } catch (e) {
    // 404 object not found
    if (e.response?.statusCode == 404) {
      res.status(404).json({error: 'token not found'}) ;
      return;
    }
    other_error(res, e);
  }
});

app.get('/tokens', require_sub(), async (req, res) => {
  if (req.query.offset == undefined && req.query.start_id == undefined && req.query.end_id == undefined) {
    res.status(400).json({error: 'need offset, start_id or end_id'});
    return;
  }
  
  if (req.query.count <= 0 || req.query.count > CONFIG.page_limit) {
    res.status(400).json({error: 'count out of range'});
    return;
  }
  
  try {
    const tokens = await db.get_tokens(
      req.query.offset,
      req.query.start_id,
      req.query.end_id,
      req.query.count,
      req.query.newest_first,
    );
    res.json(tokens);
  } catch (e) {
    if (e.error == 'offset out of range') {
      res.status(400).json(e);
      return;
    }
    other_error(res, e);
  }
});


// Note: express.json() activates json body parsing
app.put('/token', express.json(), require_sub('generator', 'admin'), async (req, res) => {
  try {
    const token = req.body;
    // check required attributes: svg, generated, keywords
    if (!token.svg || !token.generated || !token.keywords) {
      res.status(400).json({error: 'required attribute(s) missing'});
      return;
    }
    const result = await db.put_token(req.body);
    res.json(result);
  } catch (e) {
    other_error(res, e);
  }
});

// app.delete('/token', async (req, res) => {
// });

// app.delete('/tokens', async (req, res) => {
// });


app.get('/request_interaction', require_sub('exhibition', 'admin'), async (req, res) => {
  try {
    // check queue size
    const queue_size = await db.interaction_queue_size();
    if (queue_size >= CONFIG.queue_limit) {
      res.status(423).json({error: 'queue limit reached'}); // 423 Locked (WebDAV; RFC 4918)
      return;
    }
    const int = await db.request_interaction();
    res.json(int);
  } catch (e) {
    other_error(res, e);
  }
});

app.get('/deposit_interaction', require_sub('exhibition', 'admin'), async (req, res) => {
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  if (!req.query.keywords) {
    res.status(400).json({error: 'keywords missing'});
    return;
  }
  try {
    let keywords = req.query.keywords;
    keywords = keywords.toLowerCase();
    keywords = keywords.split(/[\.,;/]/);
    if (keywords.length != 3) {
      res.status(400).json({error: 'exactly three keywords needed'});
      return;
    }
    await db.deposit_interaction(req.query.id, keywords);
    res.end();
  } catch (e) {
    if (e.error == 'not found') {
      res.status(404).json(e);
      return;
    } else if (e.error == 'already deposited') {
      res.status(400).json(e);
      return;
    } else if (e.error == 'expired') {
      res.status(400).json(e);
      return;
    }
    other_error(res, e);
  }
});

app.get('/interaction_updates', require_sub('exhibition', 'admin'), async (req, res) => {
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  try {
    if ( ! await db.check_interaction(req.query.id) ) {
      res.status(404).json({error: 'not found'});
      return;
    }
    const int = await db.get_single_interaction_updates(req.query.id, req.query.since, req.query.timeout);
    res.json(int);
  } catch (e) {
    if (e.error == 'timeout') {
      res.status(504).end(); // Respond with 504 Gateway Timeout
      return;
    }
    other_error(res, e);
  }
});

app.get('/new_interaction_updates', require_sub('generator', 'admin'), async (req, res) => {
  try {
    const int = await db.get_new_interaction_updates(req.query.since, req.query.timeout);
    res.json(int);
  } catch (e) {
    if (e.error == 'timeout') {
      res.status(504).end(); // Respond with 504 Gateway Timeout
      return;
    }
    other_error(res, e);
  }
});

app.get('/waiting_interactions', require_sub('generator', 'admin'), async (req, res) => {
  try {
    const ints = await db.get_waiting_interactions(req.query.since);
    res.json(ints);
  } catch (e) {
    if (e.error == 'invalid timestamp') {
      res.status(400).json(e);
      return;
    }
    other_error(res, e);
  }
});

app.get('/update_interaction', require_sub('generator', 'admin'), async (req, res) => {
  if (!req.query.id) {
    res.status(400).json({error: 'id missing'});
    return;
  }
  // Note: 0 == '' -> true, so using === to compare with ''
  if ((req.query.queue_position === undefined || req.query.queue_position === '') && !req.query.token_id) {
    res.status(400).json({error: 'queue_position or token_id required'});
    return;
  }
  if (req.query.queue_position < 0) {
    res.status(400).json({error: 'invalid queue_position'});
    return;
  }
  try {
    if ( ! await db.check_interaction(req.query.id) ) {
      res.status(404).json({error: 'interaction not found'});
      return;
    }
    if ( req.query.token_id && ! await db.check_token(req.query.token_id) ) {
      res.status(404).json({error: 'token not found'});
      return;
    }
    const int = await db.update_interaction(req.query.id, req.query.queue_position, req.query.token_id);
    res.end();
  } catch (e) {
    other_error(res, e);
  }
});



/**
 * MAIN 
 */

// dbms online check
if (! await db.check_dbms()) {
  console.log('waiting for db...')
  await sleep(3000);
  if (! await db.check_dbms()) {
    console.log('database not online: exiting');
    process.exit(1);
  };
}

// check uuid algorithm (needs to be utc_random for globally sequential ids)
const uuid_status = await db.check_uuid_alg();
if (!uuid_status) {
  console.log(`setting uuid algorithm`);
  await db.set_uuid_alg();
}

// dbs check
const db_status = await db.check_dbs();
Object.entries(db_status).forEach( async ([db_name, status]) => {
  if (!status) {
    console.log(`creating db: ${db_name}`);
    await db.create_db(db_name);
  }
});
// need to wait a bit if we have just created databases, otherwise design doc creation wil fail
if (Object.values(db_status).includes(false)) await sleep(1000);

// design docs check (filters and views)
const design_docs_status = await db.check_design_docs();
if (!design_docs_status) {
  console.log('updating design docs');
  await db.create_design_docs();
}

// close server, force after timeout is reached
// timeout 0 means force immediately
// timeout < 0 means no timeout, wait indefinitely
async function close(server, connections, timeout = 0) {
  const closed = new Promise(resolve => {
    let timer = null;
    if (timeout >= 0) {
      timer = setTimeout(() => {
        console.log('force closing connections.');
        for (let socket of connections) { socket.destroy(); }
        connections.clear();
      }, timeout);
    }
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  return closed;
}

// start server
let server;
const connections = new Set();
if (CONFIG.https.enabled) {
  server = https.createServer({
    key: readFileSync(CONFIG.https.key),
    cert: readFileSync(CONFIG.https.cert),
  }, app);
} else {
  server = http.createServer(app);
}
// maintain list of active connections (socket objects)
server.on('connection', socket => {
  connections.add(socket);
  // console.log('connection added', `${socket.remoteAddress}:${socket.remotePort}`);
  socket.on('close', () => {
    connections.delete(socket);
    // console.log('connection closed', `${socket.remoteAddress}:${socket.remotePort}`);
  });
});
server.listen(CONFIG.port, CONFIG.host, () => {
  const secure = server instanceof https.Server;
  console.log(`${secure ? 'HTTPS ' : ''}Server running on ${server.address().address}:${server.address().port}`);
  if (!secure) console.warn('WARNING: Server is not secure (HTTPS disbaled)');
  if (!CONFIG.auth.enabled) console.warn('WARNING: Authentication disabled');
});

// gracefully handle termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(sig => process.on(sig, () => {
  console.log('signal:', sig);
  console.log('stopping.')
  close(server, connections, 3000); // force close open connections after 3s
}));

// reload certificate on signal
// place executable script in /etc/letsencrypt/renewal-hooks/post/ with the command tokens-api reload-cert
process.on('SIGUSR2', () => {
  if (!CONFIG.https.enabled) return;
  console.log('reloading tls context (key and cert)');
  try {
    server.setSecureContext({
      key: readFileSync(CONFIG.https.key),
      cert: readFileSync(CONFIG.https.cert)
    });
  } catch (e) {
    console.log('error reloading certificates:', e);
  }
});

// Instance of http(s).Server. See: https://expressjs.com/en/4x/api.html#app.listen
export default server;
