import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { golfSource } from './golf-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/bookmarklet.js'), 'utf8').replace(/\r\n/g, '\n');
const profile = JSON.parse(readFileSync(resolve(root, 'scripts/build-profile.json'), 'utf8'));
const code = await golfSource(source, profile);
const params = profile.brotli;
const bytes = brotliCompressSync(Buffer.from(code), { params: {
  [constants.BROTLI_PARAM_QUALITY]: params.quality,
  [constants.BROTLI_PARAM_MODE]: params.mode,
  [constants.BROTLI_PARAM_LGWIN]: params.lgwin,
  [constants.BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING]: params.disableLiteral,
  [constants.BROTLI_PARAM_NPOSTFIX]: params.npostfix,
  [constants.BROTLI_PARAM_NDIRECT]: params.ndirect,
} });
assert.equal(brotliDecompressSync(bytes).toString('utf8'), code);

const alphabet = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(c => !'!"#%?\\'.includes(c)).join('');
const hex = bytes.toString('hex');
let value = BigInt('0x' + hex);
const zeros = '0'.repeat(hex.length - value.toString(16).length);
let packed = '';
while (value >= 39n) {
  const digit = (value - 39n) % 88n;
  packed = alphabet[Number(digit)] + packed;
  value = (value - 39n - digit) / 88n;
}

const script = 'new(Response)(new(Response)(Uint8Array.fromHex(' + (zeros ? '"' + zeros + '"+' : '') + '[..."' + packed +
  '"].reduce((n,c)=>n*88n+BigInt(c.charCodeAt()+(c<\'&\')+(c<\'@\')+(c<\']\')),' + value + 'n)' +
  '.toString(16)' +
  ")).body.pipeThrough(new(DecompressionStream)('brotli'))).text().then(eval)";
const output = 'javascript:' + script.replace(/[%#?]|[^\x21-\x7e]/gu, encodeURIComponent);
assert.equal(new URL(output).href, output);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), output + '\n');
console.log(`Wrote dist/bookmarklet.txt (${output.length} characters)`);
