const { readFileSync, writeFileSync, mkdirSync, copyFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_API_BASE = 'https://lubuntu.tail239f3d.ts.net/v1';
const value = (process.env.API_BASE || DEFAULT_API_BASE).trim();
let base = '';
if (value) {
  let url;
  try { url = new URL(value); } catch { /* Report a consistent error below. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/(?:v1\/?)?$/.test(url.pathname)) {
    throw new Error('API_BASE must be an HTTPS origin or an HTTPS API URL ending in /v1.');
  }
  base = url.origin + '/v1';
  if (base === 'https://lubuntu.tail239f3d.ts.net:8443/v1') base = DEFAULT_API_BASE;
}

const source = readFileSync(join(__dirname, 'index.html'), 'utf8');
const placeholder = "/* API_BASE */ ''";
if (source.split(placeholder).length !== 2) throw new Error('Expected one API_BASE placeholder in index.html.');
const literal = base ? JSON.stringify(base).replace(/</g, '\\u003c') : placeholder;
writeFileSync(join(__dirname, 'publish/index.html'), source.replace(placeholder, () => literal));
const bake = readFileSync(join(__dirname, 'bake.html'), 'utf8');
if (bake.split(placeholder).length !== 2) throw new Error('Expected one API_BASE placeholder in bake.html.');
writeFileSync(join(__dirname, 'publish/bake.html'), bake.replace(placeholder, () => literal));
copyFileSync(join(__dirname, 'worker.js'), join(__dirname, 'publish/worker.js'));
let hashing;
try { hashing = require.resolve('hash-wasm/dist/sha256.umd.min.js'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.log('Installing pinned WASM build dependency using npm ci (scripts disabled).');
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: __dirname, stdio: 'inherit' });
  hashing = require.resolve('hash-wasm/dist/sha256.umd.min.js');
}
mkdirSync(join(__dirname, 'publish/download-assets'), { recursive: true });
copyFileSync(hashing, join(__dirname, 'publish/download-assets/sha256.umd.min.js'));
copyFileSync(join(__dirname, 'node_modules/hash-wasm/LICENSE'), join(__dirname, 'publish/download-assets/hash-wasm.LICENSE'));
