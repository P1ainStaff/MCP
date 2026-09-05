import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist', 'src', 'bin-stdio.mjs');
mkdirSync(dirname(src), { recursive: true });

// Ensure shebang for npx execution
const content = readFileSync(src, 'utf8');
const withShebang = content.startsWith('#!') ? content : `#!/usr/bin/env node\n${content}`;
writeFileSync(src, withShebang);
chmodSync(src, 0o755);
