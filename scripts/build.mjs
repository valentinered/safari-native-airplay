import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/bookmarklet.js'), 'utf8').trim();
const output = `javascript:${encodeURIComponent(source)}\n`;
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), output);
console.log(`Wrote dist/bookmarklet.txt (${output.length - 1} characters)`);
