import crypto from 'node:crypto';

// 32 bytes -> 64 hex chars
console.log(crypto.randomBytes(32).toString('hex'));


