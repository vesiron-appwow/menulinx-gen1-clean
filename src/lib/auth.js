/**
 * AUTH LIBRARY — MenuLinx Trade
 * Handles password hashing, session tokens, and cookie-based auth.
 *
 * Security model:
 *   - Passwords hashed with PBKDF2 (100k iterations, SHA-256)
 *   - Sessions stored in dedicated KV namespace with 8-hour TTL
 *   - HttpOnly + SameSite=Strict cookies
 */

const SESSION_TTL = 60 * 60 * 8; // 8 hours
const PBKDF2_ITERATIONS = 100000;

// ── PASSWORD HASHING ──

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return {
    hash: bufToHex(new Uint8Array(bits)),
    salt: bufToHex(salt),
  };
}

export async function verifyPassword(password, stored) {
  const salt = hexToBuf(stored.salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bufToHex(new Uint8Array(bits)) === stored.hash;
}

// ── SESSION MANAGEMENT ──

export async function createSession(kvSessions, slug) {
  const token = crypto.randomUUID();
  await kvSessions.put(`session:${token}`, JSON.stringify({ slug, createdAt: new Date().toISOString() }), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

export async function requireAuth(request, kvSessions) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/mlx_session=([^;]+)/);
  if (!match) return null;

  const raw = await kvSessions.get(`session:${match[1]}`);
  return raw ? JSON.parse(raw) : null;
}

export async function destroySession(request, kvSessions) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/mlx_session=([^;]+)/);
  if (match) {
    await kvSessions.delete(`session:${match[1]}`);
  }
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `mlx_session=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `mlx_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}

// ── HEX UTILITIES ──

function bufToHex(buf) {
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
