const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Worker } = require('node:worker_threads');

const job = { id: 'a'.repeat(32), challenge: 'b'.repeat(64), difficulty: 12, max_seconds: 10 };
const immediate = () => new Promise(resolve => setImmediate(resolve));
function setup(fetch) {
  const elements = new Map();
  const instances = [];
  const listeners = {};
  function element() {
    return {
      disabled: true, children: [], dataset: {}, listeners: {}, value: '',
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      removeAttribute(name) { delete this[name]; },
    };
  }
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  document.getElementById('threads').value = '1';
  document.getElementById('duty').value = '10';
  class BrowserWorker {
    constructor(url) { this.url = url; instances.push(this); }
    postMessage(value) { this.job = value; }
    terminate() { this.terminated = true; }
  }
  const source = fs.readFileSync(path.join(__dirname, '../publish/bake.html'), 'utf8');
  vm.runInNewContext(source.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document, window: { addEventListener(type, handler) { listeners[type] = handler; } },
    location: { search: '?kind=image&file=drawing.png' }, URL, URLSearchParams,
    Worker: BrowserWorker, fetch, AbortController, AbortSignal, setTimeout, clearTimeout,
  });
  return { elements, instances, document, listeners };
}
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('does not start before consent and verifies proof before reporting completion', async () => {
  const calls = [];
  const app = setup(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/status')) return response({ mode: 'pow-test' });
    if (url.endsWith('/jobs')) return response(job);
    return response({ ok: true, url: '/api/downloads/image/drawing.png' });
  });
  await immediate();
  assert.equal(app.instances.length, 0);
  assert.match(app.elements.get('download').href, /\/api\/downloads\/image\/drawing.png$/);
  await app.elements.get('start').listeners.click();
  assert.equal(app.instances.length, 1);
  assert.equal(app.instances[0].job.duty, 10);
  app.instances[0].onmessage({ data: { type: 'proof', nonce: '0'.repeat(16) + ':00000001' } });
  await immediate();
  assert.equal(app.instances[0].terminated, true);
  assert.equal(calls.at(-1).url.endsWith('/complete'), true);
  assert.match(app.elements.get('status').textContent, /proof verified.*No mining rewards/);
});

test('hiding the page terminates workers and cancels the job, without completing', async () => {
  const calls = [];
  const app = setup(async (url) => {
    calls.push(url);
    return response(url.endsWith('/status') ? { mode: 'pow-test' } : url.endsWith('/jobs') ? job : { ok: true });
  });
  await immediate();
  await app.elements.get('start').listeners.click();
  app.document.hidden = true;
  app.listeners.visibilitychange();
  await immediate();
  assert.equal(app.instances[0].terminated, true);
  assert.equal(calls.at(-1).endsWith('/cancel'), true);
  assert.equal(calls.some(url => url.endsWith('/complete')), false);
  assert.equal(app.elements.get('start').disabled, true);
});

test('stopping while the job is pending never starts a worker on late completion', async () => {
  let deliver;
  const calls = [];
  const app = setup(async (url) => {
    calls.push(url);
    if (url.endsWith('/status')) return response({ mode: 'pow-test' });
    if (url.endsWith('/jobs')) return new Promise(resolve => { deliver = resolve; });
    return response({ ok: true });
  });
  await immediate();
  const start = app.elements.get('start').listeners.click();
  app.elements.get('stop').listeners.click();
  deliver(response(job));
  await start;
  assert.equal(app.instances.length, 0);
  assert.equal(calls.at(-1).endsWith('/cancel'), true);
});

test('disabled contribution and timeouts never gate the ordinary download', async () => {
  const off = setup(async () => response({ mode: 'off' }));
  await immediate();
  assert.equal(off.elements.get('start').disabled, true);
  assert.ok(off.elements.get('download').href);
  const calls = [];
  const app = setup(async url => {
    calls.push(url);
    return response(url.endsWith('/status') ? { mode: 'pow-test' } : url.endsWith('/jobs') ? job : { ok: true });
  });
  await immediate();
  await app.elements.get('start').listeners.click();
  app.instances[0].onmessage({ data: { type: 'timeout' } });
  await immediate();
  assert.equal(app.instances[0].terminated, true);
  assert.equal(calls.some(url => url.endsWith('/complete')), false);
  assert.ok(app.elements.get('download').href);
});

test('an old pending request cannot create workers after stopping and restarting', async () => {
  const pending = [];
  const app = setup(async url => {
    if (url.endsWith('/status')) return response({ mode: 'pow-test' });
    if (url.endsWith('/jobs')) return new Promise(resolve => pending.push(resolve));
    return response({ ok: true });
  });
  await immediate();
  const first = app.elements.get('start').listeners.click();
  app.elements.get('stop').listeners.click();
  const second = app.elements.get('start').listeners.click();
  pending[0](response(job));
  await first;
  assert.equal(app.instances.length, 0);
  pending[1](response({ ...job, id: 'c'.repeat(32) }));
  await second;
  assert.equal(app.instances.length, 1);
  app.elements.get('stop').listeners.click();
  await immediate();
  assert.equal(app.instances[0].terminated, true);
});

test('actual self-hosted WASM worker produces a verifiable SHA-256 proof', async () => {
  const workerFile = path.join(__dirname, '../publish/worker.js');
  const library = path.join(__dirname, '../publish/download-assets/sha256.umd.min.js');
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    const fs = require('node:fs');
    const vm = require('node:vm');
    globalThis.self = globalThis;
    globalThis.crypto = require('node:crypto').webcrypto;
    self.postMessage = data => parentPort.postMessage(data);
    self.close = () => parentPort.close();
    globalThis.importScripts = () => { globalThis.hashwasm = require(${JSON.stringify(library)}); };
    vm.runInThisContext(fs.readFileSync(${JSON.stringify(workerFile)}, 'utf8'));
    parentPort.on('message', data => self.onmessage({ data }));
  `, { eval: true });
  try {
    const proof = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WASM worker did not find a proof within its limit')), 12000);
      worker.on('error', error => { clearTimeout(timeout); reject(error); });
      worker.on('message', data => {
        if (data.type === 'progress') return;
        clearTimeout(timeout);
        if (data.type === 'proof') resolve(data);
        else reject(new Error(data.error || data.type));
      });

      test('late verification cannot finish or enable controls for a restarted test', async () => {
        const verifications = [];
        const app = setup(async url => {
          if (url.endsWith('/status')) return response({ mode: 'pow-test' });
          if (url.endsWith('/jobs')) return response(job);
          if (url.endsWith('/complete')) return new Promise(resolve => verifications.push(resolve));
          return response({ ok: true });
        });
        await immediate();
        await app.elements.get('start').listeners.click();
        app.instances[0].onmessage({ data: { type: 'proof', nonce: '0'.repeat(16) + ':00000001' } });
        app.elements.get('stop').listeners.click();
        await app.elements.get('start').listeners.click();
        app.instances[1].onmessage({ data: { type: 'proof', nonce: '0'.repeat(16) + ':00000002' } });
        verifications[0](response({ ok: true, url: '/api/downloads/image/drawing.png' }));
        await immediate();
        assert.match(app.elements.get('status').textContent, /Checking the actual hash proof/);
        assert.equal(app.elements.get('start').disabled, true);
        verifications[1](response({ ok: true, url: '/api/downloads/image/drawing.png' }));
        await immediate();
        assert.match(app.elements.get('status').textContent, /CPU proof verified/);
      });
      worker.postMessage({ cmd: 'start', challenge: job.challenge, difficulty: 12, seconds: 10, duty: 10 });
    });
    assert.match(proof.nonce, /^[a-f0-9]{16}:[a-f0-9]{8}$/);
    assert.ok(crypto.createHash('sha256').update(job.challenge + ':' + proof.nonce).digest('hex').startsWith('000'));
  } finally { await worker.terminate(); }
});
