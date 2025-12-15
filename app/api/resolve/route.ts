import { NextRequest, NextResponse } from 'next/server';

interface TextSearchResponse {
  places: Array<{
    id: string;
    displayName?: {
      text: string;
    };
    formattedAddress?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
    types?: string[];
  }>;
}

interface ResolveResponse {
  candidates: Array<{
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    types: string[];
  }>;
}

interface ErrorResponse {
  error: {
    step: string;
    message: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    // 1. 检查 API Key
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: { step: 'config', message: 'GOOGLE_MAPS_API_KEY is not configured' } },
        { status: 500 }
      );
    }

    // 2. 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    // 3. 验证 query 参数
    if (!query) {
      return NextResponse.json(
        { error: { step: 'validation', message: 'query parameter is required' } },
        { status: 400 }
      );
    }

    // 4. Places API (New) - Text Search
    const placesApiUrl = 'https://places.googleapis.com/v1/places:searchText';
    const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.location,places.types';
    
    const requestBody = {
      textQuery: query,
      maxResultCount: 5,
    };

    const placesResponse = await fetch(placesApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(requestBody),
    });

    if (!placesResponse.ok) {
      const errorText = await placesResponse.text();
      return NextResponse.json(
        { error: { step: 'places_search', message: `Places API request failed: ${errorText}` } },
        { status: 500 }
      );
    }

    const placesData: TextSearchResponse = await placesResponse.json();
    
    if (!placesData.places || placesData.places.length === 0) {
      return NextResponse.json({
        candidates: [],
      });
    }

    // 5. 转换并返回结果
    const candidates = placesData.places
      .filter((place) => place.location && place.displayName)
      .map((place) => ({
        placeId: place.id,
        name: place.displayName?.text || '',
        address: place.formattedAddress || '',
        lat: place.location!.latitude,
        lng: place.location!.longitude,
        types: place.types || [],
      }));

    const response: ResolveResponse = {
      candidates,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: { step: 'unknown', message: error instanceof Error ? error.message : 'Unknown error occurred' } },
      { status: 500 }
    );
  }
}

