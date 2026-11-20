const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const value = (process.env.API_BASE || '').trim();
let base = '';
if (value) {
  let url;
  try { url = new URL(value); } catch { /* Report a consistent error below. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/(?:v1\/?)?$/.test(url.pathname)) {
    throw new Error('API_BASE must be an HTTPS origin or an HTTPS API URL ending in /v1.');
  }
  base = url.origin + '/v1';
}

const source = readFileSync(join(__dirname, 'index.html'), 'utf8');
const placeholder = "/* API_BASE */ ''";
if (source.split(placeholder).length !== 2) throw new Error('Expected one API_BASE placeholder in index.html.');
const literal = base ? JSON.stringify(base).replace(/</g, '\\u003c') : placeholder;
writeFileSync(join(__dirname, 'publish/index.html'), source.replace(placeholder, () => literal));
