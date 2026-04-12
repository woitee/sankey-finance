/**
 * AES-256-GCM encryption helpers for storing sensitive tokens in the DB.
 *
 * Key is read from the TOKEN_ENCRYPTION_KEY Convex environment variable.
 * Set it once with:
 *   npx convex env set TOKEN_ENCRYPTION_KEY $(openssl rand -hex 32)
 *
 * Ciphertext format stored in DB:  "<hex_iv>:<hex_ciphertext>:<hex_tag>"
 * All operations are done with the Web Crypto API (available in Convex runtime).
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  // AES-GCM appends the 16-byte auth tag to the end of the ciphertext
  const ivBuffer = new ArrayBuffer(iv.byteLength);
  new Uint8Array(ivBuffer).set(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encoded,
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, -16);
  const tag = encryptedBytes.slice(-16);

  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

export async function decrypt(stored: string, hexKey: string): Promise<string> {
  const [ivHex, ciphertextHex, tagHex] = stored.split(':');
  if (!ivHex || !ciphertextHex || !tagHex) throw new Error('Invalid ciphertext format');

  const key = await getKey(hexKey);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const tag = hexToBytes(tagHex);

  // Reconstitute ciphertext+tag as expected by SubtleCrypto
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const ivBuffer = new ArrayBuffer(iv.byteLength);
  new Uint8Array(ivBuffer).set(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}
