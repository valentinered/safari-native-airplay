import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/bookmarklet.js'), 'utf8').replace(/\r\n/g, '\n');
const bytes = brotliCompressSync(Buffer.from(source));

const alphabet = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(c => !"#%?\\`".includes(c)).join('');
let value = BigInt('0x1' + bytes.toString('hex'));
let packed = '';
while (value) {
  packed = alphabet[Number(value % 89n)] + packed;
  value /= 89n;
}

const script = '(()=>{let n=0n;for(let c of`' + packed.replace(/\$\{/g, '\\${') +
  '`){let x=c.charCodeAt();n=n*89n+BigInt(x-33-(x>35)-(x>37)-(x>63)-(x>92)-(x>96))}' +
  "new Response(new Blob([Uint8Array.fromHex(n.toString(16).slice(1))]).stream()" +
  ".pipeThrough(new DecompressionStream('brotli'))).text().then(eval)})()";
const output = 'javascript:' + script.replace(/[%#?]|[^\x21-\x7e]/gu, encodeURIComponent);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), output + '\n');
console.log(`Wrote dist/bookmarklet.txt (${output.length} characters)`);
