const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch, timer = setTimeout, key = 'example-key') {
  const elements = new Map();
  function element(id = '') {
    let value = '';
    return {
      id, files: [], style: {}, children: [], listeners: {}, hidden: false,
      get value() { return value; },
      set value(next) { value = next; if (!next && id === 'chatPhoto') this.files = []; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      focus() {}, click() {},
    };
  }
  const document = {
    baseURI: 'https://example.test/',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement() { return element(); },
    createTextNode(text) { return { textContent: text }; },
  };
  const storage = new Map();
  if (key) storage.set('harold_api_key', key);
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const html = fs.readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ---- Side self-talk window ----')[0];
  vm.runInNewContext(script, {
    document, localStorage, fetch, URL, FormData, AbortSignal, setTimeout: timer, console,
    window: { addEventListener() {} },
  });
  return { elements, storage };
}

test('requires a user-supplied key and uses it immediately after saving', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push(options);
    return response({ choices: [{ message: { content: 'hello' } }] });
  }, setTimeout, '');
  const input = app.elements.get('input');
  input.value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls.length, 0);
  assert.equal(input.value, 'hello');
  app.elements.get('quickKey').value = 'user-entered-key';
  app.elements.get('saveQuickKey').listeners.click();
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].headers.Authorization, 'Bearer user-entered-key');
  assert.equal(app.storage.get('harold_api_key'), 'user-entered-key');
});

test('API settings update the next chat request without reloading', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ choices: [{ message: { content: 'hello' } }] });
  });
  app.elements.get('apiBase').value = 'https://example.test/v1';
  app.elements.get('apiKey').value = 'updated-key';
  app.elements.get('apiSave').listeners.click();
  app.elements.get('input').value = 'hello';
  await app.elements.get('send').listeners.click();
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer updated-key');
  assert.equal(app.elements.get('quickKey').value, 'updated-key');
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
  input.value = 'What color?';
  await app.elements.get('send').listeners.click();
  assert.match(calls[1].url, /\/api\/chat\/images$/);
  assert.match(calls[2].url, /\/api\/chat$/);
  const body = JSON.parse(calls[2].options.body);
  assert.equal(body.prompt, 'What color?');
  assert.equal(body.image_id, 'a'.repeat(32));
  assert.deepEqual(body.history, [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hello' }]);
  assert.equal(app.elements.get('chatPhoto').files.length, 0);
  const history = JSON.parse(app.storage.get('harold_main_history'));
  assert.equal(history.at(-1).content, 'The rectangle is red.');
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
