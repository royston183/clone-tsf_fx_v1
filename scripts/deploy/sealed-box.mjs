// libsodium's crypto_box_seal without a dependency, for GitHub Actions secrets (GitHub encrypts them to the
// repository's X25519 public key). X25519 comes from node:crypto; BLAKE2b, Salsa20 and Poly1305 are written here.
// Sealed box = ephemeral public key || XSalsa20-Poly1305(message), nonce = BLAKE2b-192(ephemeral pk || recipient pk).
import { createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync } from 'node:crypto';

const MASK64 = (1n << 64n) - 1n;
const BLAKE2B_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];
const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
];
const rotr64 = (x, n) => ((x >> n) | (x << (64n - n))) & MASK64;

/** Unkeyed BLAKE2b with an output of 1 to 64 bytes (RFC 7693). */
export function blake2b(input, outlen) {
  const h = [...BLAKE2B_IV];
  h[0] ^= 0x01010000n ^ BigInt(outlen);
  const blocks = Math.max(1, Math.ceil(input.length / 128));
  for (let b = 0; b < blocks; b += 1) {
    const block = Buffer.alloc(128);
    input.copy(block, 0, b * 128, Math.min(input.length, (b + 1) * 128));
    const m = Array.from({ length: 16 }, (_, i) => block.readBigUInt64LE(i * 8));
    const last = b === blocks - 1;
    const t = BigInt(last ? input.length : (b + 1) * 128);
    const v = [...h, ...BLAKE2B_IV];
    v[12] ^= t & MASK64;
    v[13] ^= t >> 64n;
    if (last) v[14] ^= MASK64;
    const g = (a, b2, c, d, x, y) => {
      v[a] = (v[a] + v[b2] + x) & MASK64; v[d] = rotr64(v[d] ^ v[a], 32n);
      v[c] = (v[c] + v[d]) & MASK64; v[b2] = rotr64(v[b2] ^ v[c], 24n);
      v[a] = (v[a] + v[b2] + y) & MASK64; v[d] = rotr64(v[d] ^ v[a], 16n);
      v[c] = (v[c] + v[d]) & MASK64; v[b2] = rotr64(v[b2] ^ v[c], 63n);
    };
    for (let round = 0; round < 12; round += 1) {
      const s = SIGMA[round % 10];
      g(0, 4, 8, 12, m[s[0]], m[s[1]]); g(1, 5, 9, 13, m[s[2]], m[s[3]]);
      g(2, 6, 10, 14, m[s[4]], m[s[5]]); g(3, 7, 11, 15, m[s[6]], m[s[7]]);
      g(0, 5, 10, 15, m[s[8]], m[s[9]]); g(1, 6, 11, 12, m[s[10]], m[s[11]]);
      g(2, 7, 8, 13, m[s[12]], m[s[13]]); g(3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i += 1) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = Buffer.alloc(64);
  h.forEach((word, i) => out.writeBigUInt64LE(word, i * 8));
  return out.subarray(0, outlen);
}

const SIGMA_WORDS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"
const rotl32 = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

/** The Salsa20 core: 20 rounds over key, 16 input bytes. HSalsa20 keeps 8 words; Salsa20 adds the input back. */
function salsaCore(key, input16, hsalsa) {
  const k = i => key.readUInt32LE(i * 4);
  const n = i => input16.readUInt32LE(i * 4);
  const x0 = [SIGMA_WORDS[0], k(0), k(1), k(2), k(3), SIGMA_WORDS[1], n(0), n(1), n(2), n(3),
    SIGMA_WORDS[2], k(4), k(5), k(6), k(7), SIGMA_WORDS[3]];
  const x = [...x0];
  const qr = (a, b, c, d) => {
    x[b] ^= rotl32((x[a] + x[d]) >>> 0, 7); x[c] ^= rotl32((x[b] + x[a]) >>> 0, 9);
    x[d] ^= rotl32((x[c] + x[b]) >>> 0, 13); x[a] ^= rotl32((x[d] + x[c]) >>> 0, 18);
    x[a] >>>= 0; x[b] >>>= 0; x[c] >>>= 0; x[d] >>>= 0;
  };
  for (let i = 0; i < 10; i += 1) {
    qr(0, 4, 8, 12); qr(5, 9, 13, 1); qr(10, 14, 2, 6); qr(15, 3, 7, 11);
    qr(0, 1, 2, 3); qr(5, 6, 7, 4); qr(10, 11, 8, 9); qr(15, 12, 13, 14);
  }
  if (hsalsa) {
    const out = Buffer.alloc(32);
    [0, 5, 10, 15, 6, 7, 8, 9].forEach((w, i) => out.writeUInt32LE(x[w], i * 4));
    return out;
  }
  const out = Buffer.alloc(64);
  x.forEach((w, i) => out.writeUInt32LE((w + x0[i]) >>> 0, i * 4));
  return out;
}

const hsalsa20 = (key, input16) => salsaCore(key, input16, true);

/** XSalsa20 keystream of `length` bytes for a 32-byte key and a 24-byte nonce. */
function xsalsa20Stream(key, nonce, length) {
  const subkey = hsalsa20(key, nonce.subarray(0, 16));
  const out = Buffer.alloc(length);
  for (let counter = 0, offset = 0; offset < length; counter += 1, offset += 64) {
    const input = Buffer.alloc(16);
    nonce.copy(input, 0, 16, 24);
    input.writeBigUInt64LE(BigInt(counter), 8);
    salsaCore(subkey, input, false).copy(out, offset, 0, Math.min(64, length - offset));
  }
  return out;
}

const leBig = bytes => { let n = 0n; for (let i = bytes.length - 1; i >= 0; i -= 1) n = (n << 8n) | BigInt(bytes[i]); return n; };

/** Poly1305 one-time authenticator (RFC 8439). */
export function poly1305(key, message) {
  const p = (1n << 130n) - 5n;
  const r = leBig(key.subarray(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  const s = leBig(key.subarray(16, 32));
  let acc = 0n;
  for (let i = 0; i < message.length; i += 16) {
    const chunk = message.subarray(i, i + 16);
    acc = ((acc + leBig(chunk) + (1n << BigInt(8 * chunk.length))) * r) % p;
  }
  let tag = (acc + s) & ((1n << 128n) - 1n);
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) { out[i] = Number(tag & 0xffn); tag >>= 8n; }
  return out;
}

const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const rawPublic = keyObject => Buffer.from(keyObject.export({ format: 'jwk' }).x, 'base64url');
const publicKeyObject = raw => createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(raw).toString('base64url') }, format: 'jwk' });

/**
 * crypto_box_seal(message, recipientPublicKey). `ephemeralSecret` (32 bytes) is for tests only: a sealed box must use
 * a fresh ephemeral key every time.
 */
export function sealedBox(message, recipientPublicKey, { ephemeralSecret } = {}) {
  const recipient = Buffer.from(recipientPublicKey);
  if (recipient.length !== 32) throw new Error('The recipient public key must be 32 bytes');
  const privateKey = ephemeralSecret
    ? createPrivateKey({ key: Buffer.concat([PKCS8_X25519, Buffer.from(ephemeralSecret)]), format: 'der', type: 'pkcs8' })
    : generateKeyPairSync('x25519').privateKey;
  const ephemeralPublic = rawPublic(createPublicKey(privateKey));
  const shared = diffieHellman({ privateKey, publicKey: publicKeyObject(recipient) });
  const boxKey = hsalsa20(shared, Buffer.alloc(16));
  const nonce = blake2b(Buffer.concat([ephemeralPublic, recipient]), 24);
  const plain = Buffer.from(message);
  const stream = xsalsa20Stream(boxKey, nonce, 32 + plain.length);
  const cipher = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i += 1) cipher[i] = plain[i] ^ stream[32 + i];
  return Buffer.concat([ephemeralPublic, poly1305(stream.subarray(0, 32), cipher), cipher]);
}
