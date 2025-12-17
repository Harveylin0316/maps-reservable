import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { setSessionCookie } from '@/app/lib/session';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = (await request.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username/password' }, { status: 400 });
    }

    const expectedUser = requiredEnv('APP_USERNAME');
    const expectedPass = requiredEnv('APP_PASSWORD');

    const ok = timingSafeEqualStr(username, expectedUser) && timingSafeEqualStr(password, expectedPass);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await setSessionCookie(username);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


