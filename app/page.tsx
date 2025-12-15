'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

// Dynamic import for map component (SSR disabled)
const ResultsMap = dynamic(() => import('./components/ResultsMap'), {
  ssr: false,
  loading: () => (
    <div style={{ 
      width: '100%', 
      height: '520px', 
      backgroundColor: '#f0f0f0', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderRadius: '8px',
      border: '1px solid #e5e5e5'
    }}>
      <p>載入地圖中...</p>
    </div>
  ),
});

interface SearchResult {
  placeId: string;
  name: string;
  address: string;
  mapsUrl: string;
  reservable: boolean;
  lat?: number;
  lng?: number;
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

interface Candidate {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
}

interface ResolveResponse {
  candidates: Candidate[];
}

export default function Home() {
  const [query, setQuery] = useState('中山區');
  const [radiusKm, setRadiusKm] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [scanIndex, setScanIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [placeIdSet, setPlaceIdSet] = useState<Set<string>>(new Set());
  const [lastAddedCount, setLastAddedCount] = useState(0);
  const [onlyReservable, setOnlyReservable] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [showCandidates, setShowCandidates] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce 调用 resolve API
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim() || selectedCenter) {
      setCandidates([]);
      setShowCandidates(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/resolve?query=${encodeURIComponent(query)}`
        );

        if (response.ok) {
          const data: ResolveResponse = await response.json();
          setCandidates(data.candidates || []);
          setShowCandidates(data.candidates && data.candidates.length > 0);
        } else {
          setCandidates([]);
          setShowCandidates(false);
        }
      } catch (err) {
        setCandidates([]);
        setShowCandidates(false);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, selectedCenter]);

  const handleCandidateSelect = (candidate: Candidate) => {
    setSelectedCenter({ lat: candidate.lat, lng: candidate.lng });
    setSelectedLabel(`${candidate.name} - ${candidate.address}`);
    setShowCandidates(false);
    setCandidates([]);
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('請輸入地址或地名');
      return;
    }

    // 清空舊資料
    setLoading(true);
    setError(null);
    setResults([]);
    setPlaceIdSet(new Set());
    setScanIndex(0);
    setHasMore(true);
    setHasSearched(true);
    setLastAddedCount(0);
    setSelectedPlaceId(undefined);
    setShowCandidates(false);
    setCandidates([]);

    try {
      // 如果有 selectedCenter，使用 lat/lng，否则使用 query
      let searchUrl = `/api/search?radiusKm=${radiusKm}&scanIndex=0`;
      if (selectedCenter) {
        searchUrl += `&lat=${selectedCenter.lat}&lng=${selectedCenter.lng}`;
      } else {
        searchUrl += `&query=${encodeURIComponent(query)}`;
      }

      const response = await fetch(searchUrl);

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json();
        setError(errorData.error?.message || `錯誤：${response.status}`);
        return;
      }

      const data: SearchResponse = await response.json();
      
      // 建立去重集合
      const newPlaceIdSet = new Set<string>();
      const uniqueResults: SearchResult[] = [];
      
      for (const result of data.results || []) {
        if (!newPlaceIdSet.has(result.placeId)) {
          newPlaceIdSet.add(result.placeId);
          uniqueResults.push(result);
        }
      }
      
      setResults(uniqueResults);
      setPlaceIdSet(newPlaceIdSet);
      setScanIndex(data.nextScanIndex);
      setHasMore(data.hasMore);
      setLastAddedCount(uniqueResults.length);
      setCenter(data.center);
      setRadiusMeters(data.radiusMeters);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loading || !hasMore) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 如果有 selectedCenter，使用 lat/lng，否则使用 query
      let searchUrl = `/api/search?radiusKm=${radiusKm}&scanIndex=${scanIndex}`;
      if (selectedCenter) {
        searchUrl += `&lat=${selectedCenter.lat}&lng=${selectedCenter.lng}`;
      } else {
        searchUrl += `&query=${encodeURIComponent(query)}`;
      }

      const response = await fetch(searchUrl);

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json();
        setError(errorData.error?.message || `錯誤：${response.status}`);
        return;
      }

      const data: SearchResponse = await response.json();
      
      // 合併結果並去重，計算本次新增筆數
      const newResults = [...results];
      const newPlaceIdSet = new Set(placeIdSet);
      let addedCount = 0;
      
      for (const result of data.results || []) {
        if (!newPlaceIdSet.has(result.placeId)) {
          newPlaceIdSet.add(result.placeId);
          newResults.push(result);
          addedCount++;
        }
      }
      
      setResults(newResults);
      setPlaceIdSet(newPlaceIdSet);
      setScanIndex(data.nextScanIndex);
      setHasMore(data.hasMore);
      setLastAddedCount(addedCount);
      // 保持 center 和 radiusMeters 不变（只在第一次搜索时设置）
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>餐廳搜尋</h1>
        
        <div className={styles.contentWrapper}>
          <div className={styles.leftColumn}>
            <div className={styles.searchSection}>
              <div className={styles.inputGroup}>
            <label htmlFor="query" className={styles.label}>
              地址/地名
            </label>
            <input
              id="query"
              type="text"
              value={selectedLabel || query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedCenter(null);
                setSelectedLabel('');
              }}
              placeholder="輸入地址或地名"
              className={styles.input}
              disabled={loading}
            />
              </div>
              {showCandidates && candidates.length > 0 && (
                <div className={styles.candidatesList}>
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.placeId}
                      className={styles.candidateItem}
                      onClick={() => handleCandidateSelect(candidate)}
                    >
                      <div className={styles.candidateName}>{candidate.name}</div>
                      <div className={styles.candidateAddress}>{candidate.address}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedLabel && (
                <div className={styles.selectedLabel}>
                  已選擇：{selectedLabel}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCenter(null);
                      setSelectedLabel('');
                    }}
                    className={styles.clearButton}
                  >
                    清除
                  </button>
                </div>
              )}

              <div className={styles.inputGroup}>
            <label htmlFor="radius" className={styles.label}>
              搜尋半徑: {radiusKm} km
            </label>
            <input
              id="radius"
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
              className={styles.slider}
              disabled={loading}
            />
                <div className={styles.sliderLabels}>
                  <span>0 km</span>
                  <span>10 km</span>
                </div>
              </div>

              <button
                onClick={handleSearch}
                disabled={loading}
                className={styles.searchButton}
              >
                {loading ? '搜尋中...' : '搜尋餐廳'}
              </button>
            </div>

        {error && (
          <div className={styles.errorMessage}>
            <strong>錯誤：</strong>
            {error}
          </div>
        )}

        {loading && (
          <div className={styles.loadingMessage}>
            正在搜尋餐廳...
          </div>
        )}

        {!loading && !error && hasSearched && results.length === 0 && (
          <div className={styles.emptyMessage}>
            沒有找到餐廳，請嘗試調整搜尋條件
          </div>
        )}

        {results.length > 0 && (() => {
          // 根據 onlyReservable 篩選結果
          const filteredResults = onlyReservable
            ? results.filter((r) => r.reservable === true)
            : results;

          const mapPoints = filteredResults
            .filter((r) => r.lat !== undefined && r.lng !== undefined)
            .map((r) => ({
              placeId: r.placeId,
              name: r.name,
              lat: r.lat!,
              lng: r.lng!,
              reservable: r.reservable,
            }));

          return (
            <>
              <div className={styles.resultsSection}>
                <div className={styles.resultsHeader}>
                  <div className={styles.resultsTitleSection}>
                    <h2 className={styles.resultsTitle}>
                      結果：{filteredResults.length} 筆
                    </h2>
                    <div className={styles.totalCount}>
                      總共：{results.length} 筆
                    </div>
                  </div>
                  <div className={styles.scanInfo}>
                    <span>掃描進度：{scanIndex}/25</span>
                    {!hasMore && <span className={styles.scanComplete}>已掃描完</span>}
                  </div>
                </div>
                
                <div className={styles.filterSection}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={onlyReservable}
                      onChange={(e) => setOnlyReservable(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>只顯示可訂位 ✅</span>
                  </label>
                </div>

              {filteredResults.length === 0 && onlyReservable ? (
                <div className={styles.emptyMessage}>
                  沒有可訂位的餐廳
                </div>
              ) : (
                <div className={styles.resultsGrid}>
                  {filteredResults.map((r) => (
                    <div
                      key={r.placeId}
                      className={styles.restaurantCard}
                      onClick={() => setSelectedPlaceId(r.placeId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <h3 className={styles.restaurantName}>{r.name}</h3>
                      <p className={styles.restaurantAddress}>{r.address}</p>
                      <div className={styles.restaurantFooter}>
                        <span className={styles.reservableBadge}>
                          {r.reservable ? '✅ 可訂位' : '—'}
                        </span>
                        <a
                          href={r.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.mapsButton}
                          onClick={(e) => e.stopPropagation()}
                        >
                          在 Google Maps 開啟
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

                <div className={styles.loadMoreSection}>
                  <div className={styles.loadMoreInfo}>
                    {lastAddedCount > 0 && (
                      <span className={styles.newCount}>本次新增 +{lastAddedCount}</span>
                    )}
                  </div>
                  <button
                    onClick={handleLoadMore}
                    disabled={loading || !hasMore}
                    className={styles.loadMoreButton}
                  >
                    {loading ? '載入中...' : hasMore ? '載入更多' : '已掃描完'}
                  </button>
                </div>
              </div>

              {/* 地圖 - 右欄 */}
              <div className={styles.rightColumn}>
                <div className={styles.mapSection}>
                  <ResultsMap
                    center={center}
                    radiusMeters={radiusMeters}
                    points={mapPoints}
                    selectedPlaceId={selectedPlaceId}
                  />
                </div>
              </div>
            </>
          );
        })()}
          </div>
        </div>
      </main>
    </div>
  );
}
