import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi } from '../utils/xtream';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { Sidebar } from '../components/Sidebar';
import { FavoriteButton } from '../components/FavoriteButton';
import FavoriteModal from '../components/FavoriteModal';
import { ResumeModal } from '../components/ResumeModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

export default function Movies() {
  const router = useRouter();
  const { movies, setMovies, checkAndClearCache, hydrateHeavyData } = useDataStore();
  const [loading, setLoading] = useState(movies.length === 0);
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [renderLimit, setRenderLimit] = useState(20);
  const [errorInfo, setErrorInfo] = useState<string>('');

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
    saveLastFocusedChild: true,
    trackChildren: true
  });
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean, item: any, time: number }>({
    isOpen: false,
    item: null,
    time: 0
  });
  const [favModalItem, setFavModalItem] = useState<any>(null);

  useEffect(() => {
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    setPlaybackHistory(history);

    if ((window as any).electronAPI && (window as any).electronAPI.on) {
      return (window as any).electronAPI.on('mpv-progress', (data: any) => {
        const activeId = useProfileStore.getState().activeProfile?.id;
        const key = activeId ? `iptv_playback_history_${activeId}` : 'iptv_playback_history';
        const currentHistory = JSON.parse(localStorage.getItem(key) || '{}');
        if (currentHistory[data.streamId]) {
          currentHistory[data.streamId].currentTime = data.currentTime;
          currentHistory[data.streamId].duration = data.duration;
          currentHistory[data.streamId].progress = data.progress;
          currentHistory[data.streamId].watched = data.progress > 90;
          currentHistory[data.streamId].lastUpdated = Date.now();
          localStorage.setItem(key, JSON.stringify(currentHistory));
          setPlaybackHistory(currentHistory);
        }
      });
    }
  }, []);

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
      setFocus('MOVIE_SEARCH');
    }, 200);

    const fetchData = async () => {
      // 1. On tente d'abord de recharger depuis le cache disque (IndexedDB),
      //    ce qui est quasi instantané comparé à re-fetch l'API.
      await hydrateHeavyData();
      if (useDataStore.getState().movies.length > 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorInfo('');
        const vods = await xtreamApi.getVodStreams();
        // Pré-calcul du nom en minuscule une seule fois ici, plutôt qu'à
        // chaque frappe dans la recherche (évite 100k+ toLowerCase() répétés).
        const vodsWithSearchKey = vods.map((v: any) => ({
          ...v,
          _nameLower: (v.name || '').toLowerCase(),
        }));
        setMovies(vodsWithSearchKey);
      } catch (err: any) {
        setErrorInfo(err.message || String(err));
        console.error("Erreur de récupération VOD", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMovies = useMemo(() => {
    if (!debouncedSearch) return movies.slice(0, renderLimit);
    const lowerSearch = debouncedSearch.toLowerCase();
    return movies
      .filter(m => (m._nameLower || m.name.toLowerCase()).includes(lowerSearch))
      .slice(0, renderLimit);
  }, [movies, debouncedSearch, renderLimit]);

  const handlePlayMovie = useCallback((vid: any, forcedStartTime?: number) => {
    if (launchingVideo) return; // Anti-double clic
    const streamUrl = xtreamApi.getStreamUrl(vid.stream_id, 'movie', vid.container_extension || 'mkv');

    // Système de reprise de lecture (Resume)
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;

    if (history[vid.stream_id] && forcedStartTime === undefined) {
      const savedTime = history[vid.stream_id].currentTime;
      if (savedTime > 10) {
        setResumeModal({
          isOpen: true,
          item: vid,
          time: savedTime
        });
        return;
      }
    }

    setLaunchingVideo(vid.name);

    // Initialiser dans l'historique si ce n'est pas déjà fait
    if (!history[vid.stream_id as string]) {
      history[vid.stream_id as string] = {
        id: vid.stream_id,
        currentTime: 0,
        duration: 100,
        progress: 1,
        watched: false,
        lastUpdated: Date.now(),
        type: 'movie',
        title: vid.name,
        extension: vid.container_extension || 'mkv',
        cover: vid.stream_icon || ''
      };
      localStorage.setItem(historyKey, JSON.stringify(history));
      setPlaybackHistory(history);
    }

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
        streamUrl,
        streamId: vid.stream_id,
        title: vid.name,
        type: 'movie',
        startTime: startTime
      });
    } else {
      router.push(`/player/${vid.stream_id}?type=movie&extension=${vid.container_extension}&title=${encodeURIComponent(vid.name)}&cover=${encodeURIComponent(vid.stream_icon || '')}&start=${startTime}`);
    }
    setTimeout(() => setLaunchingVideo(null), 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchingVideo, router]);

  // Hook toujours appelé au même niveau (jamais dans un ternaire) :
  // corrige la violation des Rules of Hooks de la version précédente.
  const movieCards = useMemo(() => (
    filteredMovies.map((vid, idx) => (
      <FocusableMovie
        key={vid.stream_id}
        vid={vid}
        idx={idx}
        onClick={handlePlayMovie}
        onLongPress={(item: any) => setFavModalItem(item)}
      />
    ))
  ), [filteredMovies, handlePlayMovie]);

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white font-['Inter'] selection:bg-[#b5924d]/30">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar">

          {/* Notification Overlay */}
          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4 border border-white/20">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lancement : {launchingVideo}</span>
              </div>
            </div>
          )}
          {/* Ambient Atmosphere */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#b5924d]/5 blur-[200px] rounded-full" />
          </div>

          <header className="relative z-10 pt-32 pb-16 px-20">
            <div className="flex items-center justify-between mb-12 animate-in fade-in slide-in-from-left-10 duration-1000">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-[1px] bg-[#b5924d]/40" />
                <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Bibliothèque Mondiale</span>
              </div>
            </div>
            <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-tight mb-16">
              ŒUVRES <span className="opacity-30 italic font-serif text-white/50">VOD.</span>
            </h1>

            <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-200">
              <FocusableInput
                value={search}
                onChange={setSearch}
                placeholder="RECHERCHER DANS L'INDEX..."
                containerRef={ref}
              />
            </div>
          </header>

          <div className="px-20 relative z-10 pb-40">
            {loading ? (
              <div className="py-24 animate-pulse">
                <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.4em]">Indexation en cours...</p>
              </div>
            ) : filteredMovies.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12 pt-32">
                {movieCards}
              </div>
            ) : (
              <div className="py-24">
                <p className="text-gray-700 text-[10px] font-medium uppercase tracking-[0.6em]">Aucune œuvre ne correspond à ce critère.</p>
                {errorInfo && (
                  <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded">
                    <p className="text-xs font-mono text-gray-400 break-all">Erreur: {errorInfo}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <ResumeModal
            isOpen={resumeModal.isOpen}
            title={resumeModal.item?.name || ''}
            time={resumeModal.time}
            onClose={() => setResumeModal({ ...resumeModal, isOpen: false })}
            onConfirm={() => {
              const { item, time } = resumeModal;
              setResumeModal({ ...resumeModal, isOpen: false });
              handlePlayMovie(item, time);
            }}
            onStartOver={() => {
              const { item } = resumeModal;
              setResumeModal({ ...resumeModal, isOpen: false });
              handlePlayMovie(item, 0);
            }}
          />

          {favModalItem && (
            <FavoriteModal
              item={favModalItem}
              onClose={() => {
                const streamId = favModalItem.stream_id;
                setFavModalItem(null);
                // Manually restore focus to the movie card
                setTimeout(() => setFocus(`MOVIE_${streamId}`), 100);
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
    focusKey: 'MOVIE_SEARCH',
    onEnterPress: () => {
      ref.current.querySelector('input').focus();
    },
    onArrowPress: (direction) => {
      if (direction === 'up') return false;
      if (direction === 'left') {
        setFocus('NAV_MOVIES');
        return false;
      }
      return true;
    },
    onFocus: () => {
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

// Nombre de cartes qui bénéficient encore d'un délai d'animation en cascade.
// Au-delà, toutes les cartes apparaissent en même temps : évite d'étaler
// l'entrée sur 2-3 secondes quand renderLimit atteint 100.
const MAX_STAGGERED_CARDS = 20;

function FocusableMovie({ vid, idx, onClick, onLongPress }: any) {
  const rating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(vid.stream_id)]?.rating;
  });

  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = React.useRef(false);
  const lastFocusTime = React.useRef(0);

  const { ref, focused, focusKey } = useFocusable({
    focusKey: `MOVIE_${vid.stream_id}`,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_MOVIES');
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      if (!(window as any).isMouseFocus) {
        ref.current?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
      lastFocusTime.current = Date.now();
      longPressTriggered.current = false;
      ref.current?.focus();
    },
    onBlur: () => {
      // CRITICAL: Stop native focus when spatial focus leaves
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

      // Cooldown: Ignore Enter if we just gained focus
      if (Date.now() - lastFocusTime.current < 500) return;

      if (pressTimer.current) return;

      longPressTriggered.current = false;
      pressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        onLongPress(vid);
      }, 800);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
        if (!longPressTriggered.current) {
          onClick(vid);
        }
      }
    }
  };

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
      style={{ animationDelay: `${Math.min(idx, MAX_STAGGERED_CARDS) * 20}ms` }}
      className={`group relative animate-in zoom-in-95 duration-700 ring-1 transition-all duration-300 outline-none
                   ${focused ? 'ring-[#b5924d] ring-4 scale-105 shadow-[0_40px_80px_rgba(181,146,77,0.4)] z-50' : 'ring-white/5 opacity-100'}`}
    >
      <div
        onClick={(e) => {
          // e.detail > 0 means it's a real mouse click. 
          // Keyboard 'Enter' simulates a click with detail 0, which we want to ignore here.
          if (e.detail > 0) onClick(vid);
        }}
        className="aspect-[3/4.5] bg-[#0a0a0a] rounded-sm overflow-hidden cursor-pointer"
      >
        <img src={vid.stream_icon || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"}
          onError={(e) => {
            const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
            if (e.currentTarget.src !== fallback) { e.currentTarget.src = fallback; }
          }}
          alt=""
          className={`w-full h-full object-cover transition-all duration-1000 ${focused ? 'scale-110 opacity-100' : 'opacity-90'}`} />

        <div className={`absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent transition-all duration-500 flex flex-col justify-end p-8 ${focused ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-[#b5924d] mb-2">{vid.quality || 'MASTER'}</span>
          <p className="text-base font-light tracking-tight text-white line-clamp-2 leading-tight">{vid.name}</p>
        </div>

        {rating && (
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-[#b5924d]/30 px-3 py-1.5 rounded-full flex items-center space-x-1.5 z-20 shadow-lg">
            <span className="text-[10px] text-[#b5924d]">★</span>
            <span className="text-[9px] font-black text-white tracking-widest">{rating}/10</span>
          </div>
        )}
      </div>

      <div className={`absolute top-5 right-5 transition-all z-30 ${focused ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[-5px]'}`}>
        <FavoriteButton item={vid} />
      </div>
    </div>
  );
}