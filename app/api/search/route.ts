import { NextRequest, NextResponse } from 'next/server';

interface GeocodingResponse {
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  status: string;
}

interface NearbySearchResponse {
  places: Array<{
    id: string;
  }>;
}

interface PlaceDetailsResponse {
  id: string;
  displayName: {
    text: string;
  };
  formattedAddress: string;
  googleMapsUri: string;
  reservable?: boolean;
  // Places API v1 enum (e.g. PRICE_LEVEL_INEXPENSIVE, PRICE_LEVEL_MODERATE, ...)
  priceLevel?: string;
  dineIn?: boolean;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface SearchResult {
  placeId: string;
  name: string;
  address: string;
  mapsUrl: string;
  reservable: boolean;
  // Normalized "$"..."$$$$" for UI filtering
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
  dineIn?: boolean;
  signed?: boolean;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
}

function normalizePriceLevel(level?: string): SearchResult['priceLevel'] {
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

interface SearchResponse {
  center: {
    lat: number;
    lng: number;
  };
  radiusMeters: number;
  results: SearchResult[];
  scanIndex: number;
  nextScanIndex: number;
  hasMore: boolean;
}

interface ErrorResponse {
  error: {
    step: string;
    message: string;
  };
}

// Clamp 函数
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// 根据 scanIndex 计算搜索中心点
function calculateSearchCenter(
  baseLat: number,
  baseLng: number,
  scanIndex: number,
  radiusMeters: number
): { lat: number; lng: number } {
  if (scanIndex === 0) {
    return { lat: baseLat, lng: baseLng };
  }

  // 计算 r1 和 r2
  const r1 = clamp(radiusMeters * 0.45, 150, 800);
  const r2 = clamp(radiusMeters * 0.75, 250, 1400);

  let angle: number;
  let r: number;

  if (scanIndex >= 1 && scanIndex <= 12) {
    // 第一圈：12 个点，角度 = (scanIndex-1)*30 度
    angle = ((scanIndex - 1) * 30 * Math.PI) / 180;
    r = r1;
  } else if (scanIndex >= 13 && scanIndex <= 24) {
    // 第二圈：12 个点，角度 = (scanIndex-13)*30 度
    angle = ((scanIndex - 13) * 30 * Math.PI) / 180;
    r = r2;
  } else {
    // 无效 scanIndex，返回 baseCenter
    return { lat: baseLat, lng: baseLng };
  }

  // 角度转 offset
  const offsetEast = r * Math.cos(angle);
  const offsetNorth = r * Math.sin(angle);

  // 将 east/north 转成 dLat/dLng
  const latRadians = (baseLat * Math.PI) / 180;
  const dLat = offsetNorth / 111320;
  const dLng = offsetEast / (111320 * Math.cos(latRadians));

  return {
    lat: baseLat + dLat,
    lng: baseLng + dLng,
  };
}

// 并发控制函数
async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
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
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const radiusKm = searchParams.get('radiusKm');
    const scanIndexParam = searchParams.get('scanIndex');
    let scanIndex = scanIndexParam ? parseInt(scanIndexParam, 10) : 0;
    
    // 验证 scanIndex 范围
    if (isNaN(scanIndex) || scanIndex < 0 || scanIndex > 24) {
      scanIndex = 0; // 无效值默认为 0
    }

    // 3. 验证参数：必须有 query 或 lat/lng
    let baseCenter: { lat: number; lng: number } | null = null;
    
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        baseCenter = { lat, lng };
      } else {
        return NextResponse.json(
          { error: { step: 'validation', message: 'Invalid lat/lng parameters' } },
          { status: 400 }
        );
      }
    } else if (!query) {
      return NextResponse.json(
        { error: { step: 'validation', message: 'query parameter or lat/lng parameters are required' } },
        { status: 400 }
      );
    }

    // 4. 验证和转换 radiusKm
    let radiusMeters: number;
    if (radiusKm) {
      const radiusKmNum = parseFloat(radiusKm);
      if (isNaN(radiusKmNum) || radiusKmNum < 0 || radiusKmNum > 10) {
        return NextResponse.json(
          { error: { step: 'validation', message: 'radiusKm must be between 0 and 10' } },
          { status: 400 }
        );
      }
      radiusMeters = Math.round(radiusKmNum * 1000);
    } else {
      radiusMeters = 5000; // 默认 5km
    }

    // 5. Geocoding API - 如果提供了 lat/lng，直接使用；否则将 query 转换为坐标
    if (!baseCenter && query) {
      const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
      const geocodingResponse = await fetch(geocodingUrl);
      
      if (!geocodingResponse.ok) {
        return NextResponse.json(
          { error: { step: 'geocoding', message: 'Geocoding API request failed' } },
          { status: 500 }
        );
      }

      const geocodingData: GeocodingResponse = await geocodingResponse.json();
      
      if (geocodingData.status !== 'OK' || !geocodingData.results || geocodingData.results.length === 0) {
        return NextResponse.json(
          { error: { step: 'geocoding', message: `Geocoding failed: ${geocodingData.status}` } },
          { status: 500 }
        );
      }

      baseCenter = geocodingData.results[0].geometry.location;
    }

    if (!baseCenter) {
      return NextResponse.json(
        { error: { step: 'validation', message: 'Unable to determine center location' } },
        { status: 400 }
      );
    }

    const { lat: baseLat, lng: baseLng } = baseCenter;

    // 根据 scanIndex 计算搜索中心点
    const searchCenter = calculateSearchCenter(baseLat, baseLng, scanIndex, radiusMeters);

    // 6. Places API (New) - Nearby Search
    const placesApiUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    const placesRequestBody = {
      includedTypes: ['restaurant'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: {
            latitude: searchCenter.lat,
            longitude: searchCenter.lng,
          },
          radius: radiusMeters,
        },
      },
    };

    const placesResponse = await fetch(placesApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify(placesRequestBody),
    });

    if (!placesResponse.ok) {
      const errorText = await placesResponse.text();
      return NextResponse.json(
        { error: { step: 'places_search', message: `Places API request failed: ${errorText}` } },
        { status: 500 }
      );
    }

    const placesData: NearbySearchResponse = await placesResponse.json();
    
    // 计算 nextScanIndex 和 hasMore
    const nextScanIndex = scanIndex + 1;
    const hasMore = scanIndex < 24;
    
    if (!placesData.places || placesData.places.length === 0) {
      return NextResponse.json({
        center: baseCenter,
        radiusMeters,
        results: [],
        scanIndex,
        nextScanIndex,
        hasMore,
      });
    }

    // 7. Place Details API (New) - 并发限制 8
    const placeDetailsUrl = 'https://places.googleapis.com/v1/places/';
    const fieldMask =
      'id,displayName,formattedAddress,googleMapsUri,reservable,priceLevel,dineIn,location,nationalPhoneNumber,internationalPhoneNumber,websiteUri';

    const getPlaceDetails = async (placeId: string): Promise<SearchResult | null> => {
      try {
        const detailsResponse = await fetch(`${placeDetailsUrl}${placeId}`, {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
        });

        if (!detailsResponse.ok) {
          console.error(`Failed to fetch details for ${placeId}`);
          return null;
        }

        const detailsData: PlaceDetailsResponse = await detailsResponse.json();
        
        return {
          placeId: detailsData.id,
          name: detailsData.displayName?.text || '',
          address: detailsData.formattedAddress || '',
          mapsUrl: detailsData.googleMapsUri || '',
          reservable: detailsData.reservable || false,
          priceLevel: normalizePriceLevel(detailsData.priceLevel),
          dineIn: detailsData.dineIn,
          phone: detailsData.nationalPhoneNumber || detailsData.internationalPhoneNumber,
          website: detailsData.websiteUri,
          lat: detailsData.location?.latitude,
          lng: detailsData.location?.longitude,
        };
      } catch (error) {
        console.error(`Error fetching place details for ${placeId}:`, error);
        return null;
      }
    };

    // 使用并发限制 8 批量处理
    const placeIds = placesData.places.map(place => place.id);
    const placeDetailsResults = await batchProcess(placeIds, 8, getPlaceDetails);
    
    // 过滤掉 null 值
    let results: SearchResult[] = placeDetailsResults.filter(
      (result): result is SearchResult => result !== null
    );

    // 7.5 Mark globally "signed" restaurants (optional Supabase table)
    try {
      const { getSupabaseAdmin } = await import('@/app/lib/supabaseAdmin');
      const supabaseAdmin = getSupabaseAdmin();
      const placeIds = results.map((r) => r.placeId);
      if (placeIds.length > 0) {
        const { data, error } = await supabaseAdmin
          .from('signed_restaurants')
          .select('place_id')
          .in('place_id', placeIds);
        if (!error) {
          const signedSet = new Set((data || []).map((r: any) => r.place_id));
          results = results.map((r) => ({ ...r, signed: signedSet.has(r.placeId) }));
        }
      }
    } catch {
      // ignore if Supabase not configured or table doesn't exist
    }

    // 8. 返回结果
    const response: SearchResponse = {
      center: baseCenter,
      radiusMeters,
      results,
      scanIndex,
      nextScanIndex,
      hasMore,
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
