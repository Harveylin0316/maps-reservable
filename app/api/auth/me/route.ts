import { NextResponse } from 'next/server';
import { getSessionUsername } from '@/app/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const username = await getSessionUsername();
  if (!username) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, username });
}


