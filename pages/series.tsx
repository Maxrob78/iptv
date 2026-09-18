import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { Sidebar } from '../components/Sidebar';
import { FavoriteButton } from '../components/FavoriteButton';
import FavoriteModal from '../components/FavoriteModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

let lastFocusedSeriesKey: string | null = null;

export default function Series() {
  const router = useRouter();
  const { series, setSeries, checkAndClearCache } = useDataStore();
  const [loading, setLoading] = useState(series.length === 0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [renderLimit, setRenderLimit] = useState(20);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [favModalItem, setFavModalItem] = useState<any>(null);

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
    saveLastFocusedChild: true,
    trackChildren: true,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_SERIES');
        return false;
      }
      return true;
    }
  });

  // Sync Search with URL
  useEffect(() => {
    if (router.isReady && router.query.q) {
      setSearch(router.query.q as string);
      setDebouncedSearch(router.query.q as string);
    }
    const timer = setTimeout(() => {
      setRenderLimit(100);
    }, 150);
    return () => clearTimeout(timer);
  }, [router.isReady, router.query.q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (search) {
        router.replace({ pathname: router.pathname, query: { ...router.query, q: search } }, undefined, { shallow: true });
      } else {
        const { q, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    checkAndClearCache();
    setTimeout(() => {
      if (lastFocusedSeriesKey) {
        setFocus(lastFocusedSeriesKey);
      } else {
        setFocus('SERIES_SEARCH');
      }
    }, 200);
    const fetchData = async () => {
      if (series.length > 0) return;

      try {
        setLoading(true);
        setDebugInfo('');
        const { serverUrl, username, password } = require('../store/useAuthStore').useAuthStore.getState();
        const url = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=get_series`;

        const res = await fetch(url);
        const text = await res.text();

        let data;
        try {
          data = JSON.parse(text);
          setDebugInfo(JSON.stringify(data).substring(0, 500));
        } catch (e: any) {
          throw new Error(`Erreur JSON (${res.status}). Reçu: ${text.substring(0, 150)}`);
        }

        if (Array.isArray(data)) {
          setSeries(data);
        } else if (typeof data === 'object' && data !== null) {
          setSeries(Object.values(data));
        } else {
          setSeries([]);
        }
      } catch (err: any) {
        setDebugInfo(err.message || String(err));
        console.error("Erreur de récupération Séries", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [series.length, setSeries, checkAndClearCache]);

  const filteredSeries = useMemo(() => {
    if (!debouncedSearch) return series.slice(0, renderLimit);
    const lowerSearch = debouncedSearch.toLowerCase();
    return series.filter(s => s.name.toLowerCase().includes(lowerSearch)).slice(0, renderLimit);
  }, [series, debouncedSearch, renderLimit]);

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white font-['Inter'] selection:bg-[#b5924d]/30">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-72 3xl:ml-96 flex-1 relative overflow-y-auto no-scrollbar">

          {/* Ambient Atmosphere */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-20%] right-[10%] w-[40%] h-[40%] bg-white/[0.02] blur-[150px] rounded-full" />
          </div>

          <header className="relative z-10 pt-32 pb-16 px-20">
            <div className="flex items-center justify-between mb-12 animate-in fade-in slide-in-from-left-10 duration-1000">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-[1px] bg-[#b5924d]/40" />
                <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Sagas & Épisodes</span>
              </div>
            </div>
            <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-tight mb-16">
              SÉRIES <span className="opacity-30 italic font-serif text-white/50">TV.</span>
            </h1>

            <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-200">
              <FocusableInput
                value={search}
                onChange={setSearch}
                placeholder="RECHERCHER UNE COLLECTION..."
                containerRef={ref}
              />
            </div>
          </header>

          <div className="px-20 relative z-10 pb-40">
            {loading ? (
              <div className="py-24 animate-pulse">
                <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.4em]">Ouverture des archives...</p>
              </div>
            ) : filteredSeries.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12 pt-32">
                {filteredSeries.map((s: any, idx) => (
                  <FocusableSeriesCard
                    key={s.series_id}
                    s={s}
                    idx={idx}
                    onClick={() => router.push(`/series/${s.series_id}`)}
                    onLongPress={(item: any) => setFavModalItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-24">
                <p className="text-gray-700 text-[10px] font-medium uppercase tracking-[0.6em]">Aucun chapitre trouvé.</p>
                <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded">
                  <p className="text-xs font-mono text-gray-400 break-all">DEBUG: {debugInfo}</p>
                </div>
              </div>
            )}
          </div>

          {favModalItem && (
            <FavoriteModal
              item={favModalItem}
              onClose={() => {
                const sid = favModalItem.series_id;
                setFavModalItem(null);
                setTimeout(() => setFocus(`SERIES_${sid}`), 100);
              }}
            />
          )}
        </main>
      </FocusContext.Provider>
    </div>
  );
}

function FocusableInput({ value, onChange, placeholder, containerRef }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: 'SERIES_SEARCH',
    onEnterPress: () => {
      ref.current.querySelector('input').focus();
    },
    onArrowPress: (direction) => {
      if (direction === 'up') return false;
      if (direction === 'left') {
        setFocus('NAV_SERIES');
        return false;
      }
      return true;
    },
    onFocus: () => {
      lastFocusedSeriesKey = focusKey;
      if (!(window as any).isMouseFocus) {
        setTimeout(() => {
          // 1. Remonter le conteneur spécifique
          if (containerRef?.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
          } else {
            const main = document.querySelector('main');
            if (main) main.scrollTo({ top: 0, behavior: 'auto' });
          }
          // 2. Remonter la fenêtre globale au cas où
          window.scrollTo({ top: 0, behavior: 'auto' });
        }, 10);
      }
    }
  });

  return (
    <div ref={ref} className="relative group">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocus(focusKey);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape') {
            e.currentTarget.blur();
            return;
          }
          if (e.key === 'ArrowLeft') {
            const input = e.currentTarget;
            if (input.selectionStart === 0 && input.selectionEnd === 0) {
              e.preventDefault();
              e.stopPropagation();
              input.blur();
              setFocus('NAV_SERIES');
              return;
            }
          }
          e.stopPropagation();
        }}
        placeholder={placeholder}
        className={`w-full bg-transparent border-b py-6 text-xl font-light tracking-widest placeholder:text-gray-700 focus:outline-none transition-all uppercase
                       ${focused ? 'border-[#b5924d] text-white' : 'border-white/10 text-gray-500'}`}
      />
      <div className={`absolute bottom-0 left-0 h-[1px] bg-[#b5924d] transition-all duration-700 ${focused ? 'w-full' : 'w-0'}`} />
    </div>
  );
}

function FocusableSeriesCard({ s, idx, onClick, onLongPress }: any) {
  const rating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(s.series_id)]?.rating;
  });

  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = React.useRef(false);
  const lastFocusTime = React.useRef(0);

  const { ref, focused, focusKey } = useFocusable({
    focusKey: `SERIES_${s.series_id}`,
    onFocus: () => {
      lastFocusedSeriesKey = focusKey;
      if (!(window as any).isMouseFocus) {
        ref.current?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
      lastFocusTime.current = Date.now();
      longPressTriggered.current = false;
      ref.current?.focus();
    },
    onBlur: () => {
      ref.current?.blur();
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      longPressTriggered.current = false;
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (Date.now() - lastFocusTime.current < 500) return;
      if (pressTimer.current) return;

      longPressTriggered.current = false;
      pressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        onLongPress(s);
      }, 800);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
        if (!longPressTriggered.current) {
          onClick();
        }
      }
    }
  };

  const retryRef = React.useRef(0);
  const rawCover = s.cover || s.stream_icon || s.poster || s.movie_image;
  const cleanCover = React.useMemo(() => {
    if (!rawCover || typeof rawCover !== 'string') return '';
    try {
      const trimmed = rawCover.trim();
      return encodeURI(decodeURI(trimmed));
    } catch {
      return rawCover.trim();
    }
  }, [rawCover]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          (window as any).isMouseFocus = true;
          setFocus(focusKey);
          setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
        }
      }}
      style={{ animationDelay: `${idx * 20}ms` }}
      className={`group relative animate-in zoom-in-95 duration-700 ring-1 transition-all duration-300 outline-none
                   ${focused ? 'ring-[#b5924d] ring-4 scale-105 shadow-[0_40px_80px_rgba(181,146,77,0.4)] z-50' : 'ring-white/5 opacity-100'}`}
    >
      <div
        onClick={(e) => {
          if (e.detail > 0) onClick();
        }}
        className="aspect-[3/4.5] bg-[#0a0a0a] rounded-sm overflow-hidden cursor-pointer"
      >
        <img 
          loading="lazy"
          decoding="async"
          src={cleanCover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"}
          onError={(e) => {
            const target = e.currentTarget;
            if (retryRef.current < 2 && cleanCover) {
              retryRef.current += 1;
              setTimeout(() => {
                if (target) target.src = cleanCover;
              }, 800 * retryRef.current);
              return;
            }
            const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
            if (target.src !== fallback) { target.src = fallback; }
          }}
          alt=""
          className={`w-full h-full object-cover transition-all duration-1000 ${focused ? 'scale-110 opacity-100' : 'opacity-90'}`} />

        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-all duration-500 flex flex-col justify-end p-10 ${focused ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#b5924d] mb-3">SERIES EXCLU</span>
          <p className="text-base font-light tracking-tight text-white line-clamp-3 leading-tight">{s.name}</p>
        </div>

        {rating && (
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-[#b5924d]/30 px-3 py-1.5 rounded-full flex items-center space-x-1.5 z-20 shadow-lg">
            <span className="text-[10px] text-[#b5924d]">★</span>
            <span className="text-[9px] font-black text-white tracking-widest">{rating}/10</span>
          </div>
        )}
      </div>

      <div className={`absolute top-5 right-5 transition-all z-30 ${focused ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[-5px]'}`}>
        <FavoriteButton item={s} />
      </div>
    </div>
  );
}
