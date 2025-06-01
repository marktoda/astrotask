import { cfg } from './packages/core/dist/utils/config.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cwd } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('=== Configuration Investigation ===');
console.log('Current working directory:', cwd());
console.log('Script location:', __dirname);

console.log('\n=== Raw Configuration ===');
console.log('cfg.DATABASE_PATH:', cfg.DATABASE_PATH);
console.log('Type:', typeof cfg.DATABASE_PATH);

console.log('\n=== Environment Variables ===');
console.log('process.env.DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('Type:', typeof process.env.DATABASE_PATH);

console.log('\n=== Path Resolution ===');
console.log('Is relative path?', !cfg.DATABASE_PATH.startsWith('/'));
console.log('Resolved from CWD:', resolve(cwd(), cfg.DATABASE_PATH));
console.log('Resolved from script dir:', resolve(__dirname, cfg.DATABASE_PATH));

// Test different working directories
console.log('\n=== Working Directory Impact ===');
const originalCwd = cwd();
process.chdir('./packages/core');
console.log('From packages/core:', resolve(cwd(), cfg.DATABASE_PATH));
process.chdir(originalCwd);

// Check if the path is the same when loaded from different locations
console.log('\n=== Path Consistency ===');
const dbPath1 = resolve(originalCwd, cfg.DATABASE_PATH);
const dbPath2 = resolve(originalCwd, 'packages/core', '../../', cfg.DATABASE_PATH);
console.log('Path 1:', dbPath1);
console.log('Path 2:', dbPath2);
console.log('Are they equal?', dbPath1 === dbPath2); 