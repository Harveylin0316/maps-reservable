import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'mr_session';

type SessionPayload = {
  u: string; // username
  iat: number;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = (input + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function sign(data: string): string {
  const secret = requiredEnv('APP_SESSION_SECRET');
  return base64url(crypto.createHmac('sha256', secret).update(data).digest());
}

async function getCookieStore(): Promise<any> {
  const c = cookies() as any;
  return c?.then ? await c : c;
}

export async function setSessionCookie(username: string) {
  const payload: SessionPayload = { u: username, iat: Date.now() };
  const payloadStr = base64url(JSON.stringify(payload));
  const sig = sign(payloadStr);
  const value = `${payloadStr}.${sig}`;

  const store = await getCookieStore();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}

export async function clearSessionCookie() {
  const store = await getCookieStore();
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionUsername(): Promise<string | null> {
  const store = await getCookieStore();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [payloadStr, sig] = value.split('.');
  if (!payloadStr || !sig) return null;
  const expected = sign(payloadStr);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payloadJson = base64urlDecode(payloadStr).toString('utf8');
    const payload = JSON.parse(payloadJson) as SessionPayload;
    if (!payload?.u) return null;
    return payload.u;
  } catch {
    return null;
  }
}


