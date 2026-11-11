import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/create-todo-token.mjs .vercel/todo-token');
const token = randomBytes(32).toString('base64url');
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
writeFileSync(`${path}.txt`, `${token}\n`, { mode: 0o600, flag: 'wx' });
writeFileSync(`${path}.sha256`, `${createHash('sha256').update(token).digest('hex')}\n`, { mode: 0o600, flag: 'wx' });
console.log(`Created ${path}.txt for OpenClaw and ${path}.sha256 for TODO_API_TOKEN_SHA256. Contents were not printed.`);
