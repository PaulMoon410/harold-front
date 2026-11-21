'use strict';

importScripts('download-assets/sha256.umd.min.js');

let running = false;
self.onmessage = async ({ data }) => {
  if (data.cmd === 'stop') {
    running = false;
    self.close();
    return;
  }
  if (data.cmd !== 'start' || running) return;
  if (!/^[a-f0-9]{64}$/.test(data.challenge) || data.difficulty !== 12 ||
      !Number.isInteger(data.duty) || data.duty < 10 || data.duty > 50 ||
      !Number.isInteger(data.seconds) || data.seconds < 1 || data.seconds > 10) {
    self.postMessage({ type: 'error', error: 'Invalid bounded CPU test job.' });
    self.close();
    return;
  }
  running = true;
  try {
    const hasher = await hashwasm.createSHA256();
    if (!running) return;
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const prefix = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const deadline = performance.now() + data.seconds * 1000;
    let count = 0;
    while (running && performance.now() < deadline) {
      const sliceEnd = Math.min(performance.now() + data.duty / 2, deadline);
      while (running && performance.now() < sliceEnd) {
        const nonce = prefix + ':' + (count++ >>> 0).toString(16).padStart(8, '0');
        const digest = hasher.init().update(data.challenge + ':' + nonce).digest('hex');
        if (digest.startsWith('000')) {
          self.postMessage({ type: 'proof', nonce, hashes: count });
          running = false;
          self.close();
          return;
        }
      }
      self.postMessage({ type: 'progress', hashes: count });
      await new Promise(resolve => setTimeout(resolve, 50 - data.duty / 2));
    }
    self.postMessage({ type: 'timeout', hashes: count });
    self.close();
  } catch (error) {
    self.postMessage({ type: 'error', error: 'WASM CPU test failed: ' + error.message });
    self.close();
  }
};
