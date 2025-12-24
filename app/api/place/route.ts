import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface PlaceDetailsResponse {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  reservable?: boolean;
  priceLevel?: string;
  dineIn?: boolean;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude: number; longitude: number };
}

function normalizePriceLevel(level?: string): '$' | '$$' | '$$$' | '$$$$' | undefined {
  switch (level) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: { step: 'config', message: 'GOOGLE_MAPS_API_KEY is not configured' } },
        { status: 500 }
      );
    }

    const placeId = request.nextUrl.searchParams.get('placeId')?.trim();
    if (!placeId) {
      return NextResponse.json(
        { error: { step: 'validation', message: 'placeId parameter is required' } },
        { status: 400 }
      );
    }

    const placeDetailsUrl = 'https://places.googleapis.com/v1/places/';
    const fieldMask =
      'id,displayName,formattedAddress,googleMapsUri,reservable,priceLevel,dineIn,location,nationalPhoneNumber,internationalPhoneNumber,websiteUri';

    const detailsResponse = await fetch(`${placeDetailsUrl}${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
    });

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      return NextResponse.json(
        { error: { step: 'place_details', message: `Place Details failed: ${errorText}` } },
        { status: 500 }
      );
    }

    const detailsData: PlaceDetailsResponse = await detailsResponse.json();
    let signed = false;
    try {
      const { getSupabaseAdmin } = await import('@/app/lib/supabaseAdmin');
      const supabaseAdmin = getSupabaseAdmin();
      const { data } = await supabaseAdmin
        .from('signed_restaurants')
        .select('place_id')
        .eq('place_id', detailsData.id)
        .limit(1);
      signed = Array.isArray(data) && data.length > 0;
    } catch {
      // ignore if Supabase not configured / table missing
    }

    return NextResponse.json({
      placeId: detailsData.id,
      name: detailsData.displayName?.text || '',
      address: detailsData.formattedAddress || '',
      mapsUrl: detailsData.googleMapsUri || '',
      reservable: detailsData.reservable || false,
      priceLevel: normalizePriceLevel(detailsData.priceLevel),
      dineIn: detailsData.dineIn,
      signed,
      phone: detailsData.nationalPhoneNumber || detailsData.internationalPhoneNumber,
      website: detailsData.websiteUri,
      lat: detailsData.location?.latitude,
      lng: detailsData.location?.longitude,
    });
  } catch (error) {
    return NextResponse.json(
      { error: { step: 'unknown', message: error instanceof Error ? error.message : 'Unknown error occurred' } },
      { status: 500 }
    );
  }
}


