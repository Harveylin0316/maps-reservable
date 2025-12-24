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
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
  dineIn?: boolean;
  signed?: boolean;
  phone?: string;
  website?: string;
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

const VISITED_STORAGE_KEY = 'maps-reservable:visitedPlaceIds:v1';

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
  const [onlyDineIn, setOnlyDineIn] = useState(false);
  const [priceLevels, setPriceLevels] = useState<Array<'$' | '$$' | '$$$' | '$$$$'>>([]);
  const [hideVisited, setHideVisited] = useState(true);
  const [visitedPlaceIds, setVisitedPlaceIds] = useState<Set<string>>(new Set());
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [showCandidates, setShowCandidates] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadLocalVisited = () => {
    try {
      const raw = localStorage.getItem(VISITED_STORAGE_KEY);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((x) => typeof x === 'string'));
      }
      return new Set<string>();
    } catch {
      return new Set<string>();
    }
  };

  const loadServerVisited = async () => {
    const res = await fetch('/api/visited', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load visited list');
    const data = (await res.json()) as { placeIds?: string[] };
    setVisitedPlaceIds(new Set((data.placeIds || []).filter((x) => typeof x === 'string')));
  };

  // Bootstrap auth + visited list
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await res.json()) as { authenticated: boolean; username?: string };
        if (data.authenticated && data.username) {
          setAuthenticatedUser(data.username);
          await loadServerVisited();
        } else {
          setAuthenticatedUser(null);
          setVisitedPlaceIds(loadLocalVisited());
        }
      } catch {
        setAuthenticatedUser(null);
        setVisitedPlaceIds(loadLocalVisited());
      } finally {
        setAuthLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist visited to localStorage ONLY when not logged in
  useEffect(() => {
    if (authenticatedUser) return;
    try {
      localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(Array.from(visitedPlaceIds)));
    } catch {
      // ignore
    }
  }, [visitedPlaceIds, authenticatedUser]);

  const handleLogin = async () => {
    setAuthError(null);
    setSyncInfo(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || '登入失敗');
        return;
      }
      setAuthenticatedUser(loginUsername);
      setLoginPassword('');
      try {
        await loadServerVisited();
        setSyncInfo('✅ 已登入，已同步雲端「已簽約/跳過」清單');
      } catch (e) {
        setAuthError(
          e instanceof Error
            ? `已登入，但同步雲端失敗：${e.message}`
            : '已登入，但同步雲端失敗'
        );
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : '登入失敗');
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
    setSyncInfo(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthenticatedUser(null);
      setVisitedPlaceIds(loadLocalVisited());
    }
  };

  const handleImportLocalToCloud = async () => {
    setAuthError(null);
    setSyncInfo(null);
    if (!authenticatedUser) return;
    try {
      const local = Array.from(loadLocalVisited());
      const res = await fetch('/api/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds: local }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || '同步失敗');
        return;
      }
      await loadServerVisited();
      setSyncInfo(`✅ 已把本機勾選同步到雲端（${data.imported || 0} 筆）`);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : '同步失敗');
    }
  };

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
    setOnlyDineIn(false);
    setPriceLevels([]);
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

        {/* Auth */}
        <div className={styles.authBox}>
          {authLoading ? (
            <div className={styles.authMuted}>正在檢查登入狀態...</div>
          ) : authenticatedUser ? (
            <div className={styles.authRow}>
              <div className={styles.authMuted}>已登入：{authenticatedUser}</div>
              <div className={styles.authActions}>
                <button type="button" className={styles.authButton} onClick={handleImportLocalToCloud}>
                  同步本機勾選到雲端
                </button>
                <button type="button" className={styles.authButton} onClick={handleLogout}>
                  登出
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.authRow}>
              <input
                className={styles.authInput}
                placeholder="帳號"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
              <input
                className={styles.authInput}
                placeholder="密碼"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              <button type="button" className={styles.authButton} onClick={handleLogin}>
                登入（同步跨裝置）
              </button>
              <div className={styles.authMuted}>
                沒登入時僅保存在本機；登入後可跨裝置同步「已簽約/跳過」。
              </div>
            </div>
          )}
          {authError && <div className={styles.authError}>錯誤：{authError}</div>}
          {syncInfo && <div className={styles.authOk}>{syncInfo}</div>}
        </div>
        
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
          // 根據篩選條件篩選結果
          let filteredResults = results;
          if (onlyReservable) {
            filteredResults = filteredResults.filter((r) => r.reservable === true);
          }
          if (onlyDineIn) {
            filteredResults = filteredResults.filter((r) => r.dineIn === true);
          }
          if (priceLevels.length > 0) {
            filteredResults = filteredResults.filter(
              (r) => r.priceLevel && priceLevels.includes(r.priceLevel)
            );
          }
          if (hideVisited) {
            filteredResults = filteredResults.filter((r) => !visitedPlaceIds.has(r.placeId));
          }

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

                  <label className={styles.checkboxLabel} style={{ marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={hideVisited}
                      onChange={(e) => setHideVisited(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>隱藏已簽約/跳過</span>
                  </label>

                  <label className={styles.checkboxLabel} style={{ marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={onlyDineIn}
                      onChange={(e) => setOnlyDineIn(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>只顯示可內用 🍽️</span>
                  </label>
                  {onlyDineIn && (
                    <div className={styles.filterHint}>
                      依據 Google Places API 的 <code>dineIn</code> 欄位；沒有內用資料的店會被排除。
                    </div>
                  )}

                  <div className={styles.priceFilterRow}>
                    <div className={styles.priceFilterLabel}>價位：</div>
                    {(['$', '$$', '$$$', '$$$$'] as const).map((p) => {
                      const checked = priceLevels.includes(p);
                      return (
                        <label key={p} className={styles.priceChip}>
                          <input
                            type="checkbox"
                            className={styles.chipCheckbox}
                            checked={checked}
                            onChange={(e) => {
                              const nextChecked = e.target.checked;
                              setPriceLevels((prev) => {
                                if (nextChecked) return [...prev, p];
                                return prev.filter((x) => x !== p);
                              });
                            }}
                          />
                          <span className={checked ? styles.priceChipOn : styles.priceChipOff}>
                            {p}
                          </span>
                        </label>
                      );
                    })}
                    {priceLevels.length > 0 && (
                      <button
                        type="button"
                        className={styles.clearPriceButton}
                        onClick={() => setPriceLevels([])}
                      >
                        清除
                      </button>
                    )}
                  </div>

                  {priceLevels.length > 0 && (
                    <div className={styles.filterHint}>
                      價位依據 Google Places API 的 <code>priceLevel</code>（非台幣客單價）；沒有價位資料的店會被排除。
                    </div>
                  )}

                  <div className={styles.filterHint}>
                    已簽約/跳過：未登入→保存在本機；登入→同步到雲端（跨裝置/跨瀏覽器）。
                  </div>
                </div>

              {filteredResults.length === 0 && (onlyReservable || onlyDineIn || priceLevels.length > 0 || hideVisited) ? (
                <div className={styles.emptyMessage}>
                  沒有符合篩選條件的餐廳
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
                      <div className={styles.visitedRow} onClick={(e) => e.stopPropagation()}>
                        <label className={styles.visitedToggle}>
                          <input
                            type="checkbox"
                            checked={visitedPlaceIds.has(r.placeId)}
                            onChange={async (e) => {
                              const checked = e.target.checked;
                              // optimistic UI
                              setVisitedPlaceIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(r.placeId);
                                else next.delete(r.placeId);
                                return next;
                              });

                              // if logged in, persist to cloud
                              if (authenticatedUser) {
                                try {
                                  const res = await fetch('/api/visited', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ placeId: r.placeId, visited: checked }),
                                  });
                                  if (!res.ok) {
                                    // revert on failure
                                    setVisitedPlaceIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.delete(r.placeId);
                                      else next.add(r.placeId);
                                      return next;
                                    });
                                  }
                                } catch {
                                  // revert on failure
                                  setVisitedPlaceIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.delete(r.placeId);
                                    else next.add(r.placeId);
                                    return next;
                                  });
                                }
                              }
                            }}
                          />
                          <span>已簽約/跳過</span>
                        </label>
                      </div>
                      <div className={styles.contactSection} onClick={(e) => e.stopPropagation()}>
                        {r.phone ? (
                          <a className={styles.contactLink} href={`tel:${r.phone}`}>
                            📞 {r.phone}
                          </a>
                        ) : (
                          <span className={styles.contactMuted}>📞 —</span>
                        )}
                        {r.website ? (
                          <a
                            className={styles.contactLink}
                            href={r.website}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            🌐 網站
                          </a>
                        ) : (
                          <span className={styles.contactMuted}>🌐 —</span>
                        )}
                        {/* Places API 通常不直接提供 FB/IG；用一鍵搜尋做 best-effort */}
                        <a
                          className={styles.contactLink}
                          href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name} facebook`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          fb
                        </a>
                        <a
                          className={styles.contactLink}
                          href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name} instagram`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ig
                        </a>
                      </div>
                      <div className={styles.restaurantFooter}>
                        <div className={styles.badgeRow}>
                          <span className={styles.reservableBadge}>
                            {r.reservable ? '✅ 可訂位' : '—'}
                          </span>
                          <span className={styles.priceBadge}>
                            {r.priceLevel ? r.priceLevel : '—'}
                          </span>
                          {r.signed && <span className={styles.signedBadge}>已簽約</span>}
                        </div>
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
