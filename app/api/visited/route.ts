import { NextRequest, NextResponse } from 'next/server';
import { getSessionUsername } from '@/app/lib/session';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  const username = await getSessionUsername();
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'DB is not configured' },
      { status: 500 }
    );
  }
  const { data, error } = await supabaseAdmin
    .from('visited_restaurants')
    .select('place_id')
    .eq('user_id', username);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ placeIds: (data || []).map((r) => r.place_id) });
}

export async function POST(request: NextRequest) {
  const username = await getSessionUsername();
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'DB is not configured' },
      { status: 500 }
    );
  }
  const body = (await request.json()) as
    | { placeId?: string; visited?: boolean }
    | { placeIds?: string[] };

  // Bulk import: { placeIds: [...] }
  if ('placeIds' in body && Array.isArray(body.placeIds)) {
    const placeIds = body.placeIds
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean);

    if (placeIds.length === 0) {
      return NextResponse.json({ ok: true, imported: 0 });
    }

    const rows = placeIds.map((placeId) => ({ user_id: username, place_id: placeId }));
    const { error } = await supabaseAdmin
      .from('visited_restaurants')
      .upsert(rows, { onConflict: 'user_id,place_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: placeIds.length });
  }

  const placeId = 'placeId' in body ? body.placeId?.trim() : undefined;
  const visited = 'visited' in body ? body.visited : undefined;

  if (!placeId || typeof visited !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (visited) {
    const { error } = await supabaseAdmin
      .from('visited_restaurants')
      .upsert({ user_id: username, place_id: placeId }, { onConflict: 'user_id,place_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin
      .from('visited_restaurants')
      .delete()
      .eq('user_id', username)
      .eq('place_id', placeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


