const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_ERROR = 'Key không hợp lệ. Hãy nhập secret Base32, không phải mã OTP hoặc đường dẫn QR.';

function decodeSecret(raw: string): { secret: string; bytes: Uint8Array<ArrayBuffer> } {
  const compact = raw.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(compact)) throw new Error(SECRET_ERROR);

  const secret = compact.replace(/=+$/, '');
  const remainder = secret.length % 8;
  const padding = compact.length - secret.length;
  if (![0, 2, 4, 5, 7].includes(remainder)) throw new Error(SECRET_ERROR);
  if (padding > 0 && (compact.length % 8 !== 0 || padding !== (8 - remainder) % 8)) {
    throw new Error(SECRET_ERROR);
  }

  const bytes = new Uint8Array(Math.floor(secret.length * 5 / 8));
  let bits = 0;
  let buffer = 0;
  let index = 0;
  for (const character of secret) {
    buffer = (buffer << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >>> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (bytes.length === 0 || buffer !== 0) throw new Error(SECRET_ERROR);
  return { secret, bytes };
}

export function normalizeSecret(raw: string): string {
  return decodeSecret(raw).secret;
}

export function getTimeStep(nowMs: number): { counter: number; remainingSeconds: number } {
  if (!Number.isFinite(nowMs) || nowMs < 0 || !Number.isSafeInteger(Math.floor(nowMs))) {
    throw new Error('Thời gian hệ thống không hợp lệ.');
  }
  const counter = Math.floor(nowMs / 30_000);
  return { counter, remainingSeconds: Math.ceil((30_000 - nowMs % 30_000) / 1_000) };
}

export async function generateTotp(secret: string, nowMs: number): Promise<string> {
  const { counter } = getTimeStep(nowMs);
  if (!globalThis.crypto?.subtle) {
    throw new Error('Trình duyệt chưa hỗ trợ Web Crypto. Hãy mở trang qua HTTPS hoặc localhost.');
  }
  const key = await crypto.subtle.importKey(
    'raw', decodeSecret(secret).bytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const message = new ArrayBuffer(8);
  new DataView(message).setBigUint64(0, BigInt(counter), false);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = digest[digest.length - 1] & 0x0f;
  const truncated = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(truncated % 1_000_000).padStart(6, '0');
}

export function formatOtp(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
