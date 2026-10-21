import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/bookmarklet.js'), 'utf8').replace(/\r\n/g, '\n');
const bytes = brotliCompressSync(Buffer.from(source), { params: {
  [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
  [constants.BROTLI_PARAM_LGWIN]: 16,
  [constants.BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING]: 1,
} });

const alphabet = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(c => !'"#%?\\'.includes(c)).join('');
let value = BigInt('0x1' + bytes.toString('hex'));
let packed = '';
while (value) {
  packed = alphabet[Number(value % 89n)] + packed;
  value /= 89n;
}

const script = 'new(Response)(new(Response)(Uint8Array.fromHex([..."' + packed +
  '"].reduce((n,c)=>n*89n+BigInt((c=c.charCodeAt())-33-2*(c>35)-(c>37)-(c>63)-(c>92)),0n)' +
  ".toString(16).slice(1))).body.pipeThrough(new(DecompressionStream)('brotli'))).text().then(eval)";
const output = 'javascript:' + script.replace(/[%#?]|[^\x21-\x7e]/gu, encodeURIComponent);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), output + '\n');
console.log(`Wrote dist/bookmarklet.txt (${output.length} characters)`);
