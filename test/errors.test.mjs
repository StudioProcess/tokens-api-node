import tap from 'tap';
import * as db from '../db.mjs';
import * as util from '../util.mjs';
import * as test_util from '../test_util.mjs';
import { request as got } from '../test_util.mjs';

let tokens;

tap.before(async () => {
  // setup mock databases
  tokens = await test_util.setup_mock_db();
  // make requests fail faster
  db.DB.request_options = {
    retry: 0
  };
  // start server
  await test_util.start_server();
});

tap.teardown(async () => {
  test_util.teardown_mock_db();
  test_util.stop_server();
});


tap.test('get token (errors)', async t => {
  // db down
  const url_save = db.DB.url;
  db.DB.url = 'http://localhost:9999';
  try {
    await got('/token', {
      responseType: 'json',
      searchParams: { id: tokens[0].id },
      retry: 0
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 503,
      body: {error: 'db down'}
    }, 'db down');
  }
  db.DB.url = url_save;
  
  // no id
  try {
    await got('/token', {
      responseType: 'json',
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'no id');
  }
  
  // empty id
  try {
    await got('/token', {
      responseType: 'json',
      searchParams: { id: '' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'empty id');
  }
  
  // invalid id
  try {
    await got('/token', {
      responseType: 'json',
      retry: 0,
      searchParams: { id: 'abcdef' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'token not found'}
    }, 'invalid id');
  }
});

tap.test('get svg (errors)', async t => {
  try {
    await got('/svg', {
      responseType: 'json',
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'no id');
  }
  try {
    await got('/svg', {
      responseType: 'json',
      searchParams: { id:'doesnt_exist' }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'token not found'}
    }, 'id doesn\'t exits');
  }
});

tap.test('get tokens by offset (errors)', async t => {
  try {
    await got('/tokens', {
      responseType: 'json',
      searchParams: {}
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'need offset, start_id or end_id'}
    }, 'none of offset, start_id, end_id given');
  }
  
  try {
    await got('/tokens', {
      responseType: 'json',
      searchParams: { offset:0, count:0 }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'count out of range'}
    }, 'count too small');
  }
  
  try {
    await got('/tokens', {
      responseType: 'json',
      searchParams: { offset:0, count:999999 }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'count out of range'}
    }, 'count too big');
  }
  
  let res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:10, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:10, rows: [], prev: tokens[9].id, next: null }
  }, 'going one over');
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:99, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:99, rows: [], prev: null, next: null }
  }, 'going over more');
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:-11, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:-11, rows: [], prev: null, next: tokens[0].id }
  }, 'going one below');
  
  res = await got('/tokens', {
    responseType: 'json',
    searchParams: { offset:-99, count:1 }
  });
  t.match(res, {
    statusCode: 200,
    body: { offset:-99, rows: [], prev: null, next: null }
  }, 'going below more');
});

tap.test('put token (errors)', async t => {
  try {
    await got('/token', {
      method: 'put',
      responseType: 'json'
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'required attribute(s) missing'}
    }, 'no body');
  }
  
  try {
    await got('/token', {
      method: 'put',
      responseType: 'json',
      json: {
        svg: 'abc',
        generated: 'abc'
      }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'required attribute(s) missing'}
    }, 'incomplete');
  }
  
  try {
    await got('/token', {
      method: 'put',
      responseType: 'json',
      json: {
        svg: 'abc',
        generated: 'abc',
        keywords: ''
      }
    });
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'required attribute(s) missing'}
    }, 'attribute empty');
  }
});

tap.test('request interaction (errors)', async t => {
  // queue limit (3)
  let res1 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res1.statusCode, 200);
  let res1x = await got('/update_interaction', {responseType: 'json', searchParams: {id: res1.body.id, queue_position:0}}); // updates status -> 'waiting'
  
  let res2 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res2.statusCode, 200);
  let res2x = await got('/update_interaction', {responseType: 'json', searchParams: {id: res2.body.id, queue_position:1}});
  
  let res3 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res3.statusCode, 200);
  let res3x = await got('/update_interaction', {responseType: 'json', searchParams: {id: res3.body.id, queue_position:2}});
  
  try {
    let res4 = await got('/request_interaction', {responseType: 'json'});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 423,
      body: {error: 'queue limit reached'}
    });
  }
  
  // remove one and try again
  let res5 = await got('/update_interaction', {responseType: 'json', searchParams: {id: res1.body.id, queue_position:0, token_id:tokens[0].id}});
  let res6 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res6.statusCode, 200);
  
  // should be able to request a few
  res6 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res6.statusCode, 200);
  res6 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res6.statusCode, 200);
  res6 = await got('/request_interaction', {responseType: 'json'});
  t.equal(res6.statusCode, 200);
  
  // complete one (updates status -> new)
  let res7 = await got('/deposit_interaction', {responseType: 'json', searchParams: {id: res6.body.id, keywords:'a,b,c'}});

  try {
    let res8 = await got('/request_interaction', {responseType: 'json'});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 423,
      body: {error: 'queue limit reached'}
    });
  }
});

tap.test('deposit interaction (errors)', async t => {
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'invalid', keywords:'a,b,c'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'not found'}
    }, 'invalid id');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'', keywords:'a,b,c'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (1)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {keywords:'a,b,c'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (2)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (3)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {keywords:'', id:'xyz'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'keywords missing'}
    }, 'missing keywords (1)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'keywords missing'}
    }, 'missing keywords (2)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', keywords:'one'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'exactly three keywords needed'}
    }, 'not enough keywords (1)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', keywords:'one,two'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'exactly three keywords needed'}
    }, 'not enough keywords (2)');
  }
  try {
    let res = await got('/deposit_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', keywords:'one,two,three,four'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'exactly three keywords needed'}
    }, 'not enough keywords (2)');
  }
});

tap.test('get single interaction updates (errors)', async t => {
  try {
    let res = await got('/interaction_updates', {responseType: 'json', retry: 0, searchParams: {id:''}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (1)');
  }
  try {
    let res = await got('/interaction_updates', {responseType: 'json', retry: 0});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (2)');
  }
  try {
    let res = await got('/interaction_updates', {responseType: 'json', retry: 0, searchParams: {id: 'xyz'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'not found'}
    }, 'invalid id');
  }
});

tap.test('get new interaction updates (errors)', async t => {
  t.pass('has no error conditions');
});

tap.test('update interaction (errors)', async t => {
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:''}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (1)');
  }
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'id missing'}
    }, 'missing id (2)');
  }
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'queue_position or token_id required'}
    }, 'missing params');
  }
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', queue_position:-1}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'invalid queue_position'}
    }, 'negative queue position');
  }
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', queue_position:''}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 400,
      body: {error: 'queue_position or token_id required'}
    }, 'empty queue position');
  }
  try {
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', queue_position:'', token_id:'abc'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'interaction not found'}
    }, 'empty queue position but token given');
  }
  try {
    let int = await db.request_interaction();
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:int.id, queue_position:'', token_id:'abc'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'token not found'}
    }, 'invalid token');
  }
  try {
    let int = await db.request_interaction();
    let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:int.id, token_id:'abc'}});
    t.fail('should throw');
  } catch (e) {
    t.match(e.response, {
      statusCode: 404,
      body: {error: 'token not found'}
    }, 'invalid token (no queue position)');
  }

  
  // try {
  //   let res = await got('/update_interaction', {responseType: 'json', retry: 0, searchParams: {id:'xyz', queue_position:0}});
  //   t.fail('should throw');
  // } catch (e) {
  //   t.match(e.response, {
  //     statusCode: 404,
  //     body: {error: 'interaction not found'}
  //   }, 'invalid interaction id');
  // }
});