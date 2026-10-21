import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { minify } from 'terser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/bookmarklet.js'), 'utf8').replace(/\r\n/g, '\n');
const { code } = await minify(source, { format: { comments: false } });
const bytes = brotliCompressSync(Buffer.from(code), { params: {
  [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
  [constants.BROTLI_PARAM_LGWIN]: 16,
  [constants.BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING]: 1,
  [constants.BROTLI_PARAM_NPOSTFIX]: 1,
  [constants.BROTLI_PARAM_NDIRECT]: 16,
} });

const alphabet = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(c => !'"#%?\\'.includes(c)).join('');
const sentinel = bytes[0] < 16;
let value = BigInt('0x' + (sentinel ? '1' : '') + bytes.toString('hex'));
let packed = '';
while (value) {
  packed = alphabet[Number(value % 89n)] + packed;
  value /= 89n;
}

const script = 'new(Response)(new(Response)(Uint8Array.fromHex([..."' + packed +
  '"].reduce((n,c)=>n*89n+BigInt((c=c.charCodeAt())-33-2*(c>35)-(c>37)-(c>63)-(c>92)),0n)' +
  '.toString(16)' + (sentinel ? '.slice(1)' : '') +
  ")).body.pipeThrough(new(DecompressionStream)('brotli'))).text().then(eval)";
const output = 'javascript:' + script.replace(/[%#?]|[^\x21-\x7e]/gu, encodeURIComponent);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), output + '\n');
console.log(`Wrote dist/bookmarklet.txt (${output.length} characters)`);
