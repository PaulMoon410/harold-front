const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(fetch, timer = setTimeout, base = 'https://example.test/v1', session = new Map()) {
  const elements = new Map();
  function element(id = '') {
    let value = '';
    return {
      id, files: [], style: {}, children: [], listeners: {}, hidden: false,
      classList: { add() {}, remove() {} },
      querySelector(selector) { return document.getElementById(selector.slice(1)); },
      get value() { return value; },
      set value(next) { value = next; if (!next && id === 'chatPhoto') this.files = []; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      removeAttribute(name) { delete this[name]; },
      appendChild(child) { this.children.push(child); },
      focus() {}, click() {},
    };
  }
  const document = {
    baseURI: 'https://example.test/',
    body: element('body'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement() { return element(); },
    createTextNode(text) { return { textContent: text }; },
  };
  const storage = new Map();
  if (base) storage.set('harold_api_base', base);
  storage.set('harold_api_key', 'obsolete-key');
  storage.set('harold_api_key_base', base);
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const sessionStorage = {
    getItem(key) { return session.get(key) || null; },
    setItem(key, value) { session.set(key, value); },
    removeItem(key) { session.delete(key); },
  };
  const html = fs.readFileSync(path.join(__dirname, '../publish/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document, localStorage, sessionStorage, fetch, URL, FormData, AbortSignal, setTimeout: timer, console,
    window: { addEventListener() {} },
  });
  return { elements, storage, session };
}

test('sends chat without asking for or including an API key', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  });
  const input = app.elements.get('input');
  input.value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).model, 'harold');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].options.body).tool_choice, undefined);
  assert.equal(Object.keys(calls[0].options.headers).length, 1);
  assert.equal(app.storage.has('harold_api_key'), false);
  assert.equal(app.storage.has('harold_api_key_base'), false);
});

test('enables backend-managed tools for authenticated text requests only', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'I looked that up.' } }] });
  });
  app.elements.get('toolsBtn').listeners.click();
  assert.match(app.elements.get('log').children.at(-1).children[0].textContent, /Save an API key/);
  assert.equal(app.elements.get('toolsBtn').textContent, 'TOOLS: OFF');

  app.elements.get('quickKey').value = 'test-key';
  app.elements.get('saveQuickKey').listeners.click();
  assert.equal(app.elements.get('toolsBtn').textContent, 'TOOLS: AUTO');
  app.elements.get('input').value = 'Find out more';
  await app.elements.get('send').listeners.click();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[0].options.body).tool_choice, 'auto');

  app.elements.get('sideInput').value = 'Look up another detail';
  await app.elements.get('sideSend').listeners.click();
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/chat\/completions\?self=1$/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[1].options.body).tool_choice, 'auto');

  app.elements.get('quickKey').value = '';
  app.elements.get('saveQuickKey').listeners.click();
  assert.equal(app.elements.get('toolsBtn').textContent, 'TOOLS: OFF');
});

test('uses the Lubuntu HTTPS API when no endpoint has been saved', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, '');
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://lubuntu.tail239f3d.ts.net/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).model, 'harold');
});

test('API URL settings update the next chat request without reloading', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  });
  app.elements.get('apiBase').value = 'https://pixel.example.test/';
  app.elements.get('apiSave').listeners.click();
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://pixel.example.test/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  app.elements.get('sideInput').value = 'Think about it';
  await app.elements.get('sideSend').listeners.click();
  assert.equal(calls[1].url, 'https://pixel.example.test/v1/chat/completions?self=1');
  assert.equal(calls[1].options.headers.Authorization, undefined);
});

test('migrates the retired gateway without forwarding its session key', async () => {
  const oldBase = 'https://lubuntu.tail239f3d.ts.net:8443/v1';
  const session = new Map([['harold_api_key_session', JSON.stringify({ base: oldBase, key: 'old-key' })]]);
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, oldBase, session);
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  app.elements.get('sideInput').value = 'Think';
  await app.elements.get('sideSend').listeners.click();
  assert.deepEqual(calls.map(call => call.url), [
    'https://lubuntu.tail239f3d.ts.net/v1/chat/completions',
    'https://lubuntu.tail239f3d.ts.net/v1/chat/completions?self=1',
  ]);
  for (const call of calls) {
    assert.equal(JSON.parse(call.options.body).model, 'harold');
    assert.equal(call.options.headers.Authorization, undefined);
  }
});

test('preserves the main API and its existing session key', async () => {
  const base = 'https://lubuntu.tail239f3d.ts.net/v1';
  const session = new Map([['harold_api_key_session', JSON.stringify({ base, key: 'test-key' })]]);
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, base, session);
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, base + '/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
});

test('optional key authenticates chat and self-talk and can be cleared', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  });
  app.elements.get('quickKey').value = 'test-key';
  app.elements.get('saveQuickKey').listeners.click();
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  app.elements.get('sideInput').value = 'Think about it';
  await app.elements.get('sideSend').listeners.click();
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-key');
  assert.equal(app.storage.has('harold_api_key'), false);
  assert.equal(JSON.parse(app.session.get('harold_api_key_session')).base, 'https://example.test/v1');
  app.elements.get('quickKey').value = '';
  app.elements.get('saveQuickKey').listeners.click();
  app.elements.get('input').value = 'again';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[2].options.headers.Authorization, undefined);
  assert.equal(app.session.has('harold_api_key_session'), false);
});

test('session key is restored only for its configured HTTPS endpoint', async () => {
  const session = new Map();
  const first = setup(async () => response({}), setTimeout, 'https://example.test/v1', session);
  first.elements.get('quickKey').value = 'test-key';
  first.elements.get('saveQuickKey').listeners.click();

  const calls = [];
  const restored = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, 'https://example.test/v1', session);
  restored.elements.get('input').value = 'hello';
  await restored.elements.get('send').listeners.click();
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');

  restored.elements.get('apiBtn').listeners.click();
  restored.elements.get('apiBase').value = 'https://other.example.test/v1';
  restored.elements.get('apiBase').listeners.input();
  assert.equal(restored.elements.get('apiKey').value, '');
  restored.elements.get('apiSave').listeners.click();
  restored.elements.get('input').value = 'again';
  await restored.elements.get('send').listeners.click();
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(session.has('harold_api_key_session'), false);
});

test('rejects insecure endpoints and keeps the safe default', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, '');
  app.elements.get('apiBase').value = 'http://pixel.example.test/v1';
  app.elements.get('apiSave').listeners.click();
  assert.match(app.elements.get('apiError').textContent, /HTTPS/);
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://lubuntu.tail239f3d.ts.net/v1/chat/completions');
});

function response(data, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => data };
}

test('image question uploads then sends image ID and previous history', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/chat/images')) return response({ ok: true, image_id: 'a'.repeat(32) });
    if (url.endsWith('/api/chat')) return response({ response: 'The rectangle is red.' });
    return response({ choices: [{ message: { content: 'Hello' } }] });
  });
  const input = app.elements.get('input');
  input.value = 'hello';
  await app.elements.get('send').listeners.click();
  const file = new Blob(['image'], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'sample.png' });
  app.elements.get('chatPhoto').files = [file];
  app.elements.get('chatPhoto').listeners.change();
  assert.equal(app.elements.get('chatPhotoPreview').hidden, false);
  assert.match(app.elements.get('chatPhotoPreview').src, /^blob:/);
  input.value = 'What color?';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[1].url, 'https://example.test/api/chat/images');
  assert.equal(calls[2].url, 'https://example.test/api/chat');
  const body = JSON.parse(calls[2].options.body);
  assert.equal(body.prompt, 'What color?');
  assert.equal(body.image_id, 'a'.repeat(32));
  assert.deepEqual(body.history, [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hello' }]);
  assert.equal(app.elements.get('chatPhoto').files.length, 0);
  assert.equal(app.elements.get('chatPhotoPreview').hidden, true);
  assert.equal(app.elements.get('chatPhotoPreview').src, undefined);
  const history = JSON.parse(app.storage.get('harold_main_history'));
  assert.equal(history.at(-1).content, 'The rectangle is red.');
});

test('removing or replacing an attachment clears its preview', () => {
  const app = setup(async () => response({}));
  const picker = app.elements.get('chatPhoto');
  const preview = app.elements.get('chatPhotoPreview');
  picker.files = [new Blob(['image'], { type: 'image/png' })];
  picker.listeners.change();
  assert.equal(preview.hidden, false);
  app.elements.get('removePhoto').listeners.click();
  assert.equal(preview.hidden, true);
  assert.equal(preview.src, undefined);
  picker.files = [new Blob(['image'], { type: 'image/png' })];
  picker.listeners.change();
  picker.files = [{ type: 'text/plain', size: 1 }];
  picker.listeners.change();
  assert.equal(preview.hidden, true);
  assert.equal(preview.src, undefined);
});

test('reports the HTTP status when an image upload returns non-JSON', async () => {
  const app = setup(async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('invalid JSON'); } }));
  app.elements.get('chatPhoto').files = [new Blob(['image'], { type: 'image/png' })];
  app.elements.get('chatPhoto').listeners.change();
  await app.elements.get('send').listeners.click();
  assert.match(app.elements.get('log').children.at(-1).children[0].textContent, /HTTP 500/);
});

test('photo enhancement uses the configured backend for uploads and output links', async () => {
  const requests = [];
  const imagePath = '/images/enhanced-' + 'a'.repeat(32) + '.jpg';
  const app = setup(async url => {
    requests.push(url);
    return response({ ok: true, url: imagePath });
  });
  const picker = app.elements.get('photo');
  picker.files = [new Blob(['image'], { type: 'image/png' })];
  await picker.listeners.change();
  assert.deepEqual(requests, ['https://example.test/api/images/enhance']);
  const output = app.elements.get('log').children.at(-1);
  assert.ok(output.children.some(child => child.src === 'https://example.test' + imagePath));
});

test('creates an image without an API key and displays its preview', async () => {
  const calls = [];
  let finish;
  const app = setup((url, options) => {
    calls.push({ url, options });
    return new Promise(resolve => { finish = resolve; });
  });
  app.elements.get('input').value = 'a blue circle';
  const pending = app.elements.get('generateImage').listeners.click();
  assert.equal(app.elements.get('imageActivity').hidden, false);
  assert.equal(calls[0].url, 'https://example.test/api/public/images/generate');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].options.body).prompt, 'a blue circle');
  finish(response({ ok: true, url: '/images/generated-' + 'a'.repeat(32) + '.png' }));
  await pending;
  assert.equal(app.elements.get('imageActivity').hidden, true);
  const output = app.elements.get('log').children.at(-1);
  assert.ok(output.children.some(child => child.src === 'https://example.test/images/generated-' + 'a'.repeat(32) + '.png'));
});

test('natural image requests bypass native text tools and preserve follow-up references', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ response: '![waffle](/images/waffle.png)' });
  });
  app.elements.get('quickKey').value = 'test-key';
  app.elements.get('saveQuickKey').listeners.click();
  app.elements.get('input').value = 'Make me a picture of a waffle fighting a pancake with light sabers';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://example.test/api/chat');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[0].options.body).tool_choice, undefined);
  const output = app.elements.get('log').children.at(-1);
  assert.ok(output.children.some(child => child.src === 'https://example.test/images/waffle.png'));
  app.elements.get('input').value = 'Change the last picture to blue';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[1].url, 'https://example.test/api/chat');
  assert.match(JSON.parse(calls[1].options.body).history.at(-1).content, /waffle.png/);
});

test('authenticated create button uses image learning and retains the result in chat history', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/images/generate')) return response({
      ok: true, images: [{ local: '/images/waffle.png', learning: { error: 'Visual memory failed.' } }],
    });
    return response({ response: 'Edited.' });
  });
  app.elements.get('quickKey').value = 'test-key';
  app.elements.get('saveQuickKey').listeners.click();
  app.elements.get('input').value = 'a golden waffle';
  await app.elements.get('generateImage').listeners.click();
  assert.equal(calls[0].url, 'https://example.test/api/images/generate');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  assert.match(app.elements.get('log').children.at(-1).children.at(-1).textContent, /Visual memory failed/);
  app.elements.get('input').value = 'Change it to blue';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[1].url, 'https://example.test/api/chat');
  assert.match(JSON.parse(calls[1].options.body).history.at(-1).content, /waffle.png/);
});

test('routes surreal drawing requests without requiring the word picture', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ response: '![dragon](/images/dragon.png)' });
  });
  app.elements.get('input').value = 'Draw a teapot dragon with clockwork wings';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://example.test/api/chat');
  assert.equal(JSON.parse(calls[0].options.body).prompt, 'Draw a teapot dragon with clockwork wings');
});

test('displays image fidelity warnings beside the generated preview', async () => {
  const app = setup(async () => response({
    ok: true, images: [{ local: '/images/wrong.png', learning: {
      warning: 'The generated image does not match the request: Humans replaced the waffle.',
    } }],
  }));
  app.elements.get('quickKey').value = 'test-key';
  app.elements.get('saveQuickKey').listeners.click();
  app.elements.get('input').value = 'a waffle character';
  await app.elements.get('generateImage').listeners.click();
  assert.match(app.elements.get('log').children.at(-1).children.at(-1).textContent, /does not match the request/);
});

test('does not silently ignore an attached image when creating from text', async () => {
  const app = setup(() => { throw new Error('unexpected request'); });
  app.elements.get('input').value = 'make a picture';
  app.elements.get('chatPhoto').files = [new Blob(['image'], { type: 'image/png' })];
  await app.elements.get('generateImage').listeners.click();
  assert.equal(app.elements.get('input').value, 'make a picture');
  assert.match(app.elements.get('log').children.at(-1).children[0].textContent, /Remove the attached image/);
});

test('activity shows actual upload and response stages and clears on completion', async () => {
  let finishUpload;
  let finishChat;
  const app = setup(url => new Promise(resolve => {
    if (url.endsWith('/api/chat/images')) finishUpload = resolve;
    else finishChat = resolve;
  }));
  app.elements.get('chatPhoto').files = [new Blob(['image'], { type: 'image/png' })];
  const pending = app.elements.get('send').listeners.click();
  assert.equal(app.elements.get('chatActivity').hidden, false);
  assert.match(app.elements.get('chatActivityText').textContent, /Uploading image/);
  finishUpload(response({ ok: true, image_id: 'a'.repeat(32) }));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.elements.get('chatActivityText').textContent, /waiting for Harold to analyze/);
  finishChat(response({ response: 'A red image.' }));
  await pending;
  assert.equal(app.elements.get('chatActivity').hidden, true);
});

test('activity clears when a message fails', async () => {
  const app = setup(async () => { throw new Error('offline'); });
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(app.elements.get('chatActivity').hidden, true);
  assert.equal(app.elements.get('retryQueue').hidden, false);
});

test('photo activity remains visible while enhancement is pending', async () => {
  let finish;
  const app = setup(() => new Promise(resolve => { finish = resolve; }));
  const picker = app.elements.get('photo');
  picker.files = [new Blob(['image'], { type: 'image/png' })];
  const pending = picker.listeners.change();
  assert.equal(app.elements.get('photoActivity').hidden, false);
  assert.match(app.elements.get('photoActivityText').textContent, /enhancing photo/);
  finish(response({ ok: true, url: '/images/enhanced-' + 'a'.repeat(32) + '.jpg' }));
  await pending;
  assert.equal(app.elements.get('photoActivity').hidden, true);
});

test('upload failure pauses the queue with its attachment available for retry', async () => {
  let attempts = 0;
  const app = setup(async url => {
    if (url.endsWith('/api/chat/images')) {
      attempts++;
      return attempts === 1 ? response({ error: 'server unavailable' }, false) :
        response({ ok: true, image_id: 'a'.repeat(32) });
    }
    return response({ response: 'A picture' });
  });
  const file = new Blob(['image'], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'sample.png' });
  app.elements.get('chatPhoto').files = [file];
  app.elements.get('input').value = 'Describe it';
  await app.elements.get('send').listeners.click();
  assert.equal(app.elements.get('retryQueue').hidden, false);
  assert.equal(app.storage.has('harold_main_history'), false);
  assert.equal(app.elements.get('status').textContent, 'error');
  await app.elements.get('retryQueue').listeners.click();
  assert.equal(attempts, 2);
  assert.equal(JSON.parse(app.storage.get('harold_main_history'))[0].content, 'Describe it');
});

test('queues later messages and sends them in order with the previous answer', async () => {
  const calls = [];
  let completeFirst;
  const first = new Promise(resolve => { completeFirst = resolve; });
  const app = setup(async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return first;
    return response({ choices: [{ message: { content: 'second answer' } }] });
  });
  const input = app.elements.get('input');
  input.value = 'first';
  const pending = app.elements.get('send').listeners.click();
  input.value = 'second';
  await app.elements.get('send').listeners.click();
  assert.equal(calls.length, 1);
  assert.equal(input.disabled, undefined);
  completeFirst(response({ choices: [{ message: { content: 'first answer' } }] }));
  await pending;
  assert.deepEqual(calls[1].messages.map(message => message.content), ['first', 'first answer', 'second']);
  assert.equal(JSON.parse(app.storage.get('harold_main_history')).length, 4);
});

test('retries a server busy response and keeps message order', async () => {
  const waits = [];
  let attempts = 0;
  const app = setup(async () => {
    attempts++;
    return attempts === 1 ? response({ error: { message: 'Harold is busy; try again shortly.' } }, false) :
      response({ choices: [{ message: { content: 'ready' } }] });
  }, (resolve, delay) => { waits.push(delay); resolve(); });
  app.elements.get('input').value = 'please wait';
  await app.elements.get('send').listeners.click();
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [10000]);
  assert.equal(JSON.parse(app.storage.get('harold_main_history'))[1].content, 'ready');
});

test('retries an image request without uploading the image twice', async () => {
  let uploads = 0;
  let chats = 0;
  const app = setup(async url => {
    if (url.endsWith('/api/chat/images')) {
      uploads++;
      return response({ ok: true, image_id: 'a'.repeat(32) });
    }
    chats++;
    return chats === 1 ? response({ error: 'Harold is still processing another message; try again shortly.' }, false) :
      response({ response: 'Image described' });
  }, resolve => resolve());
  const file = new Blob(['image'], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'sample.png' });
  app.elements.get('chatPhoto').files = [file];
  await app.elements.get('send').listeners.click();
  assert.equal(uploads, 1);
  assert.equal(chats, 2);
  assert.equal(JSON.parse(app.storage.get('harold_main_history'))[1].content, 'Image described');
});

test('rate limiting waits before retrying instead of dropping a message', async () => {
  const waits = [];
  let attempts = 0;
  const app = setup(async () => {
    attempts++;
    return attempts === 1
      ? { ...response({ error: { message: 'rate limit exceeded' } }, false), status: 429 }
      : response({ choices: [{ message: { content: 'ready' } }] });
  }, (resolve, delay) => { waits.push(delay); resolve(); });
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.deepEqual(waits, [65000]);
  assert.equal(attempts, 2);
});

test('a failed message pauses later messages until explicitly discarded', async () => {
  let rejectFirst;
  const first = new Promise((resolve, reject) => { rejectFirst = reject; });
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return first;
    return response({ choices: [{ message: { content: 'done' } }] });
  });
  const input = app.elements.get('input');
  input.value = 'first';
  const pending = app.elements.get('send').listeners.click();
  input.value = 'second';
  await app.elements.get('send').listeners.click();
  rejectFirst(new Error('network error'));
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(app.elements.get('discardQueue').hidden, false);
  assert.equal(app.elements.get('clearBtn').disabled, true);
  await app.elements.get('discardQueue').listeners.click();
  assert.equal(calls[1].messages.at(-1).content, 'second');
  assert.equal(app.elements.get('clearBtn').disabled, false);
});

test('rejects invalid images before upload', () => {
  const app = setup(() => { throw new Error('unexpected request'); });
  const picker = app.elements.get('chatPhoto');
  picker.files = [{ name: 'large.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 }];
  picker.listeners.change();
  assert.equal(picker.files.length, 0);
  assert.match(app.elements.get('attachmentNote').textContent, /no larger than 10 MB/);
});

test('renders returned image and download link without activating unsafe links', async () => {
  const app = setup(async () => response({
    choices: [{ message: { content: '![photo](https://example.test/photo.jpg) [Download](https://example.test/photo.jpg) [bad](javascript:alert)' } }],
  }));
  app.elements.get('input').value = 'Show me';
  await app.elements.get('send').listeners.click();
  const output = app.elements.get('log').children.at(-1);
  assert.ok(output.children.some(child => child.src === 'https://example.test/photo.jpg'));
  assert.ok(output.children.some(child => child.href === 'https://example.test/photo.jpg' && child.textContent === 'Download'));
  assert.ok(!output.children.some(child => child.href && child.href.startsWith('javascript:')));
});
