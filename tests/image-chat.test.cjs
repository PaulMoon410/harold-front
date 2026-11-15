const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch) {
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
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const html = fs.readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ---- Side self-talk window ----')[0];
  vm.runInNewContext(script, {
    document, localStorage, fetch, URL, FormData, AbortSignal, setTimeout, console,
  });
  return { elements, storage };
}

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

test('upload failure retains attachment and prompt for retry', async () => {
  const app = setup(async () => response({ error: 'server unavailable' }, false));
  const file = new Blob(['image'], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'sample.png' });
  app.elements.get('chatPhoto').files = [file];
  app.elements.get('input').value = 'Describe it';
  await app.elements.get('send').listeners.click();
  assert.equal(app.elements.get('input').value, 'Describe it');
  assert.equal(app.elements.get('chatPhoto').files[0], file);
  assert.equal(app.storage.has('harold_main_history'), false);
  assert.equal(app.elements.get('status').textContent, 'error');
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
