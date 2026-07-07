import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const basePath = config.match(/basePath:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? '';
const host = process.env.HOSTNAME || process.env.HOST || 'localhost';
const port = process.env.PORT || '3000';
const url = `http://${host}:${port}${basePath}`;

console.log(`\nPrinted Label Designer: ${url}\n`);