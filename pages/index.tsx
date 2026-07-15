import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi } from '../utils/xtream';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { Sidebar } from '../components/Sidebar';
import { ResumeModal } from '../components/ResumeModal';
import { LoadingScreen } from '../components/LoadingScreen';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

export default function Home() {
  const router = useRouter();
  const { isLoggedIn, serverUrl, username, password } = useAuthStore();
  const { movies, channels, series, setMovies, setChannels, setSeries, checkAndClearCache, isRefreshing, setIsRefreshing, hydrateHeavyData } = useDataStore();
  const [mounted, setMounted] = useState(false);
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playbackHistory, setPlaybackHistory] = useState<any[]>([]);

  // State pour le ResumeModal
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean, item: any, type: string, time: number }>({
    isOpen: false,
    item: null,
    type: '',
    time: 0
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
    saveLastFocusedChild: true,
    trackChildren: true,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_INDEX');
        return false;
      }
      return true;
    }
  });

  useEffect(() => {
    setMounted(true);
    // On force le focus sur le bouton principal après un court instant
    setTimeout(() => {
      setFocus('HERO_RESUME');
    }, 200);
    const getGroupedHistory = (historyObj: any) => {
      const grouped = new Map();

      Object.entries(historyObj).forEach(([id, item]: [string, any]) => {
        if (item.type === 'live') return;
        if (item.progress <= 1) return;

        if (item.type === 'series') {
          const sId = item.seriesId || item.id;
          if (!grouped.has(sId)) {
            grouped.set(sId, {
              ...item,
              id: sId,
              title: item.seriesTitle || item.title,
              cover: item.seriesCover || item.cover,
              episodes: [id]
            });
          } else {
            const existing = grouped.get(sId);
            existing.episodes.push(id);
            if (item.lastUpdated > existing.lastUpdated) {
              existing.lastUpdated = item.lastUpdated;
              existing.progress = item.progress;
              // On peut aussi garder l'id du dernier épisode regardé si besoin
            }
          }
        } else {
          // Film
          if (item.progress < 90) {
            grouped.set(id, { id, ...item });
          }
        }
      });

      return Array.from(grouped.values()).sort((a: any, b: any) => b.lastUpdated - a.lastUpdated);
    };

    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');

    setPlaybackHistory(getGroupedHistory(history));

    // Écouteur global pour la progression MPV (Dashboard)
    if ((window as any).electronAPI && (window as any).electronAPI.on) {
      const removeProgress = (window as any).electronAPI.on('mpv-progress', (data: any) => {
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

          // Rafraîchir la liste "À Poursuivre"
          setPlaybackHistory(getGroupedHistory(currentHistory));
        }
      });

      return () => removeProgress();
    }
  }, []);

  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    // Ne rien faire si les données sont déjà chargées et qu'il n'y a pas de refresh forcé
    if (movies.length > 0 && channels.length > 0 && series.length > 0 && !isRefreshing) return;

    const fetchData = async () => {
      setLoading(true);
      checkAndClearCache();

      await hydrateHeavyData();
      const state = useDataStore.getState();
      if (state.movies.length > 0 && state.channels.length > 0 && state.series.length > 0 && !isRefreshing) {
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // On exécute les requêtes de manière SÉQUENTIELLE (une par une).
      // Les serveurs IPTV bloquent souvent les requêtes simultanées (anti-flood).

      try {
        const freshMovies = await xtreamApi.getVodStreams();
        setMovies(freshMovies);
      } catch (err) {
        console.error("Erreur films", err);
      }

      try {
        const freshChannels = await xtreamApi.getLiveStreams();
        setChannels(freshChannels);
      } catch (err) {
        console.error("Erreur chaînes", err);
      }

      try {
        const res = await fetch(`${serverUrl}/player_api.php?username=${username}&password=${password}&action=get_series`);
        const freshSeriesRaw = await res.json();
        if (Array.isArray(freshSeriesRaw)) {
          setSeries(freshSeriesRaw);
        } else if (typeof freshSeriesRaw === 'object' && freshSeriesRaw !== null) {
          setSeries(Object.values(freshSeriesRaw));
        } else {
          setSeries([]);
        }
      } catch (err) {
        console.error("Erreur séries", err);
      }

      setLoading(false);
      setIsRefreshing(false);
    };

    fetchData();
  }, [mounted, isLoggedIn, serverUrl, username, password, isRefreshing]);

  const handleRemoveHistory = (id: string) => {
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');

    let deleted = false;
    Object.keys(history).forEach(key => {
      if (key === id || history[key].seriesId === id || history[key].id === id) {
        delete history[key];
        deleted = true;
      }
    });

    if (deleted) {
      localStorage.setItem(historyKey, JSON.stringify(history));

      setPlaybackHistory(prev => {
        const updated = prev.filter(item => item.id !== id);

        setTimeout(() => {
          if (updated.length > 0) {
            setFocus(`HISTORY_ITEM_${updated[0].id}`);
          } else {
            setFocus('HERO_RESUME');
          }
        }, 100);

        return updated;
      });
    }
  };


  const isSport = (name: string) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return ['ufc', 'wwe', 'motogp', 'f1 ', 'formula 1', 'wrestlemania', 'sport', 'mma', 'boxing', 'champion', 'ligue', 'cup', 'wimbledon', 'rugby', 'nba', 'nfl'].some(k => lower.includes(k));
  };

  const recentMovies = React.useMemo(() => {
    return [...movies]
      .filter(m => !isSport(m.name))
      .sort((a, b) => Number(b.added || 0) - Number(a.added || 0))
      .slice(0, 20);
  }, [movies]);

  const topRatedMovies = React.useMemo(() => {
    return [...movies]
      // On filtre les films avec une note entre 7 et 9.5 pour éliminer les faux 10/10 (films obscurs)
      .filter(m => !isSport(m.name) && Number(m.rating || 0) >= 7 && Number(m.rating || 0) <= 9.5)
      // On trie par date d'ajout pour avoir les bons films les plus récents
      .sort((a, b) => Number(b.added || 0) - Number(a.added || 0))
      .slice(0, 20);
  }, [movies]);

  const recentSeries = React.useMemo(() => {
    // On essaie d'abord de prendre les séries avec une note pour éviter les événements sportifs
    const ratedSeries = series.filter(s => !isSport(s.name) && Number(s.rating || 0) > 0);
    const sourceArray = ratedSeries.length > 10 ? ratedSeries : series.filter(s => !isSport(s.name));

    return [...sourceArray]
      .sort((a, b) => Number(b.last_modified || b.added || 0) - Number(a.last_modified || a.added || 0))
      .slice(0, 20);
  }, [series]);

  const topChannels = React.useMemo(() => {
    const sportsChannels = channels.filter(c => ['sport', 'bein', 'canal+', 'rmc', 'eurosport', 'dazn'].some(k => c.name?.toLowerCase().includes(k)));
    return sportsChannels.length > 0 ? sportsChannels.slice(0, 20) : channels.slice(0, 20);
  }, [channels]);

  const handlePlayItem = (item: any, type: 'live' | 'movie' | 'series', forcedStartTime?: number) => {
    if (launchingVideo) return; // Anti-double clic
    const streamId = item.stream_id || item.id;
    const streamUrl = xtreamApi.getStreamUrl(streamId, type, item.container_extension || (type === 'live' ? 'ts' : 'mkv'));

    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';

    // Vérifier s'il y a un temps de reprise sauvegardé
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;

    if (type !== 'live' && history[streamId] && forcedStartTime === undefined) {
      const savedTime = history[streamId].currentTime;
      if (savedTime > 10) {
        // Au lieu de window.confirm, on ouvre notre Modal
        setResumeModal({
          isOpen: true,
          item,
          type,
          time: savedTime
        });
        return;
      }
    }

    setLaunchingVideo(item.name || item.title);

    // Marquer comme EN COURS dans l'historique (sauf pour le Live)
    if (type !== 'live') {
      if (!history[streamId as string]) {
        history[streamId as string] = {
          id: streamId,
          currentTime: 0,
          duration: 100,
          progress: 1,
          watched: false,
          lastUpdated: Date.now(),
          type: type,
          title: item.name || item.title,
          extension: item.container_extension || 'mkv',
          seriesId: item.seriesId || (type === 'series' ? item.series_id || item.id : null),
          seriesTitle: item.seriesTitle || null,
          seriesCover: item.seriesCover || null,
          cover: item.cover || item.stream_icon || ''
        };
        localStorage.setItem(historyKey, JSON.stringify(history));
      }
    }

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
        streamUrl,
        streamId: streamId,
        title: item.name || item.title,
        type: type,
        startTime: startTime
      });
    } else {
      router.push(`/player/${streamId}?type=${type}&extension=${item.container_extension || ''}&title=${encodeURIComponent(item.name || item.title)}&start=${startTime}`);
    }
    setTimeout(() => setLaunchingVideo(null), 3000);
  };

  if (!mounted) return null;

  if (loading && movies.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex-1 flex bg-[#050505] text-white min-h-screen font-['Inter'] selection:bg-[#b5924d]/30">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar">

          {/* Notification Overlay */}
          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4 border border-white/20">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lecture : {launchingVideo}</span>
              </div>
            </div>
          )}
          {/* Ambient Atmosphere - Dynamic based on featured movie */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-[#b5924d]/10 blur-[250px] rounded-full animate-pulse duration-[10s]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/[0.02] blur-[200px] rounded-full" />
            {playbackHistory[0] && (
              <div
                className="absolute inset-0 opacity-[0.15] grayscale transition-all duration-1000"
                style={{
                  backgroundImage: `url(${playbackHistory[0].cover})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(100px)'
                }}
              />
            )}
          </div>

          {/* Hero Section Luxury - Dynamic */}
          <div className="relative min-h-[75vh] flex flex-col justify-center px-20 z-10 pt-20">
            {/* Background Poster for Hero */}
            {playbackHistory[0] ? (
              <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-[#030303]/90 via-[#030303]/30 to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-transparent z-10" />
                <img
                  src={playbackHistory[0].cover}
                  className="w-full h-full object-cover object-top opacity-100 scale-105"
                  alt=""
                />
              </div>
            ) : movies[0] && (
              <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-[#030303]/90 via-[#030303]/30 to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-transparent z-10" />
                <img
                  src={movies[Math.floor(Math.random() * 10)]?.stream_icon}
                  className="w-full h-full object-cover object-top opacity-100 scale-105"
                  alt=""
                />
              </div>
            )}

            <div className="max-w-5xl animate-in fade-in slide-in-from-left-10 duration-[1200ms]">
              <div className="flex items-center space-x-6 mb-6">
                <div className="w-10 h-[1px] bg-[#b5924d]/60" />
                <span className="text-[9px] font-bold uppercase tracking-[0.5em] text-[#b5924d]">
                  {playbackHistory[0] ? "Reprendre la lecture" : "À la une"}
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6 uppercase max-w-3xl">
                {playbackHistory[0] ? (
                  <>
                    <span className="text-[#b5924d]">{playbackHistory[0].title.split(' ')[0]}</span>{' '}
                    <span className="font-extralight opacity-90">{playbackHistory[0].title.split(' ').slice(1).join(' ')}</span>
                  </>
                ) : (
                  <>PLATINUM <span className="font-extralight opacity-30 italic font-serif">CINEMA</span></>
                )}
              </h1>

              {playbackHistory[0] && playbackHistory[0].type !== 'series' && (
                <div className="flex items-center space-x-4 mb-8">
                  <div className="h-[2px] w-32 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#b5924d]" style={{ width: `${playbackHistory[0].progress}%` }} />
                  </div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{Math.round(playbackHistory[0].progress)}% Terminé</span>
                </div>
              )}

              <p className="text-gray-400 text-base font-light max-w-xl leading-relaxed tracking-wide mb-10 opacity-80">
                {playbackHistory[0] ?
                  "Continuez votre voyage cinématographique là où vous l'avez interrompu." :
                  "Le meilleur du cinéma mondial, sélectionné pour votre plaisir exclusif."}
              </p>

              <div className="flex space-x-6">
                <FocusableHeroButton
                  focusKey="HERO_RESUME"
                  onClick={() => {
                    if (playbackHistory[0]) {
                      handlePlayItem(playbackHistory[0], playbackHistory[0].type);
                    } else if (movies[0]) {
                      handlePlayItem(movies[0], 'movie');
                    }
                  }}
                  primary
                >
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <span>{playbackHistory[0] ? "Reprendre" : "Regarder"}</span>
                </FocusableHeroButton>

                <FocusableHeroButton
                  onClick={() => router.push('/movies')}
                >
                  Catalogue
                </FocusableHeroButton>
              </div>
            </div>
          </div>

          <div className="px-20 relative z-10 space-y-24 pb-40 mt-12">
            {playbackHistory.length > 0 && (
              <DashboardRow
                title="À Poursuivre"
                focusKey="HISTORY_ROW"
                items={playbackHistory.map(item => {
                  let foundCover = item.cover || item.seriesCover;
                  let foundName = item.seriesTitle || item.title;

                  if (!foundCover || foundName === 'Registre Inconnu') {
                    const movieMatch = movies.find(m => String(m.stream_id) === String(item.id));
                    if (movieMatch) {
                      foundCover = movieMatch.stream_icon;
                      foundName = movieMatch.name;
                    } else {
                      const seriesMatch = series.find(s => String(s.series_id || s.id) === String(item.seriesId || item.id));
                      if (seriesMatch) {
                        foundCover = seriesMatch.stream_icon || seriesMatch.cover;
                        foundName = seriesMatch.name;
                      }
                    }
                  }

                  return {
                    ...item,
                    name: foundName || 'Registre Inconnu',
                    cover: foundCover || 'https://via.placeholder.com/300x450?text=No+Image'
                  };
                })}
                onClick={(item: any) => {
                  if (item.seriesId) {
                    router.push(`/series/${item.seriesId}`);
                  } else {
                    handlePlayItem(item, 'movie');
                  }
                }}
                onViewAll={null}
                onRemove={handleRemoveHistory}
                isHistory
                rowAttribute="data-history-row"
              />
            )}

            <DashboardRow
              title="Derniers Ajouts Cinéma"
              items={recentMovies}
              onClick={(movie: any) => handlePlayItem(movie, 'movie')}
              onViewAll={() => router.push('/movies')}
            />

            <DashboardRow
              title="Tendances Cinéma"
              items={topRatedMovies}
              onClick={(movie: any) => handlePlayItem(movie, 'movie')}
            />

            <DashboardRow
              title="Sports & Événements"
              items={topChannels}
              onClick={(ch: any) => handlePlayItem(ch, 'live')}
              onViewAll={() => router.push('/channels')}
              isChannel
            />

            <DashboardRow
              title="Séries du Moment"
              items={recentSeries}
              onClick={(item: any) => router.push(`/series/${item.series_id || item.id}`)}
              onViewAll={() => router.push('/series')}
              isSeries
            />
          </div>

          <ResumeModal
            isOpen={resumeModal.isOpen}
            title={resumeModal.item?.name || resumeModal.item?.title || ''}
            time={resumeModal.time}
            onClose={() => {
              setResumeModal({ ...resumeModal, isOpen: false });
              setFocus('HERO_RESUME');
            }}
            onConfirm={() => {
              const { item, type, time } = resumeModal;
              setResumeModal({ ...resumeModal, isOpen: false });
              handlePlayItem(item, type as any, time);
            }}
            onStartOver={() => {
              const { item, type } = resumeModal;
              setResumeModal({ ...resumeModal, isOpen: false });
              handlePlayItem(item, type as any, 0);
            }}
          />
        </main>
      </FocusContext.Provider>
    </div>
  );
}

function FocusableHeroButton({ children, onClick, primary, focusKey: customFocusKey }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'up') return false;
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_INDEX');
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      if (!(window as any).isMouseFocus) {
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'auto' });
          const main = document.querySelector('main');
          if (main) main.scrollTo({ top: 0, behavior: 'auto' });
        }, 10);
      }
    }
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}
      className={`px-10 py-4 rounded-xl font-bold text-[9px] uppercase tracking-[0.4em] transition-all duration-300 flex items-center space-x-3 outline-none relative overflow-hidden glass-reflection
                 ${primary
          ? (focused ? 'bg-gradient-to-r from-white to-gray-200 text-black scale-105 shadow-[0_0_40px_rgba(255,255,255,0.4)]' : 'bg-gradient-to-r from-[#b5924d] to-[#8a6e38] text-black shadow-[0_10px_30px_rgba(181,146,77,0.3)]')
          : (focused ? 'bg-white text-black scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'bg-white/5 backdrop-blur-xl text-white border border-white/10 hover:bg-white/10')}`}
    >
      {children}
    </button>
  );
}

function DashboardRow({ title, items, onClick, onViewAll, onRemove, isChannel = false, isSeries = false, isHistory = false, rowAttribute }: any) {
  const rowRef = React.useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = direction === 'left' ? -600 : 600;
      rowRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const rowProps = rowAttribute ? { [rowAttribute]: true } : {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-10 duration-[1500ms] group/row relative" {...rowProps}>
      <div className="flex items-end justify-between mb-12 border-b border-white/[0.05] pb-6">
        <h2 className="text-sm font-medium uppercase tracking-[0.6em] text-gray-400">
          {title}
        </h2>
        {onViewAll && (
          <span
            onClick={onViewAll}
            className="text-[9px] font-bold uppercase tracking-[0.4em] text-[#b5924d] hover:text-white cursor-pointer transition-all"
          >
            Tout l'Index ›
          </span>
        )}
      </div>

      {/* Navigation Minimale */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-[-60px] top-[60%] -translate-y-1/2 z-30 w-12 h-12 flex items-center justify-center rounded-full opacity-0 group-hover/row:opacity-100 transition-all border border-white/5 hover:bg-white hover:text-black hidden lg:flex"
      >
        <span className="text-xl font-light">‹</span>
      </button>

      <button
        onClick={() => scroll('right')}
        className="absolute right-[-60px] top-[60%] -translate-y-1/2 z-30 w-12 h-12 flex items-center justify-center rounded-full opacity-0 group-hover/row:opacity-100 transition-all border border-white/5 hover:bg-white hover:text-black hidden lg:flex"
      >
        <span className="text-xl font-light">›</span>
      </button>

      <div
        ref={rowRef}
        className="flex space-x-12 overflow-x-auto pb-40 pt-10 scroll-smooth no-scrollbar p-20 -m-20"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item: any, idx: number) => (
          <FocusableCard
            key={item.stream_id || item.series_id || item.id || idx}
            item={item}
            onClick={onClick}
            onRemove={onRemove}
            isChannel={isChannel}
            isHistory={isHistory}
            // Focus key stable et prévisible pour l'historique : indispensable pour pouvoir
            // rediriger le focus vers une carte précise après suppression d'un item
            // (norigin-spatial-navigation ne peut retrouver un élément que via sa focusKey).
            customFocusKey={isHistory ? `HISTORY_ITEM_${item.id}` : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function FocusableCard({ item, onClick, onRemove, isChannel, isHistory, customFocusKey }: any) {
  const rating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(item.stream_id || item.series_id || item.id)]?.rating;
  });

  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: () => onClick(item),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_INDEX');
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      if (!(window as any).isMouseFocus) {
        ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    }
  });

  React.useEffect(() => {
    if ((window as any).electronAPI && (window as any).electronAPI.send) {
      const isVisible = focused && isHistory && !!onRemove;
      (window as any).electronAPI.send('remote-visibility', { isHistoryFocus: isVisible });

      return () => {
        if (isVisible) {
          (window as any).electronAPI.send('remote-visibility', { isHistoryFocus: false });
        }
      };
    }
  }, [focused, isHistory, onRemove]);

  React.useEffect(() => {
    if (!focused || !isHistory || !onRemove) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace' || e.keyCode === 46 || e.keyCode === 8) {
        e.stopPropagation();
        onRemove(item.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focused, isHistory, onRemove, item.id]);

  return (
    <div
      ref={ref}
      onClick={() => onClick(item)}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          (window as any).isMouseFocus = true;
          setFocus(focusKey);
          setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
        }
      }}
      className={`flex-shrink-0 cursor-pointer group relative transition-all duration-500 glass-reflection isolate
                 ${focused ? 'ring-[#b5924d] ring-4 scale-105 shadow-[0_40px_80px_rgba(181,146,77,0.3)] z-40 transform-gpu' : 'ring-white/5 ring-1 opacity-100 z-10'}
                 ${isChannel ? 'w-48 h-48 rounded-2xl' : 'w-56 aspect-[3/4.5] rounded-xl'}`}
    >
      {isHistory && onRemove && (
        <FocusableRemoveButton
          onRemove={() => onRemove(item.id)}
          parentFocused={focused}
        />
      )}

      <div className={`w-full h-full overflow-hidden bg-[#0a0a0a] relative ${isChannel ? 'rounded-2xl' : 'rounded-xl'}`}>
        <img
          src={item.stream_icon || item.cover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"}
          onError={(e) => {
            const fallback = isChannel
              ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23b5924d'%3ENO SIGNAL%3C/text%3E%3C/svg%3E"
              : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
            if (e.currentTarget.src !== fallback) { e.currentTarget.src = fallback; }
          }}
          alt=""
          className={`w-full h-full transition-all duration-1000 ${focused ? 'scale-110 opacity-100' : 'opacity-90'} ${isChannel ? 'object-contain mb-4 filter drop-shadow-2xl' : 'object-cover'}`}
        />



        {!isChannel && (
          <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-all duration-500 flex flex-col justify-end p-8 ${focused ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-[#b5924d] mb-2">{item.quality || 'MASTER'}</span>
            <p className="text-base font-light tracking-tight text-white truncate">{item.name || item.title}</p>
          </div>
        )}

        {rating && !isChannel && (
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-[#b5924d]/30 px-3 py-1.5 rounded-full flex items-center space-x-1.5 z-20 shadow-lg">
            <span className="text-[10px] text-[#b5924d]">★</span>
            <span className="text-[9px] font-black text-white tracking-widest">{rating}/10</span>
          </div>
        )}

        {isHistory && item.progress && item.type !== 'series' && (
          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/10 z-20">
            <div className="h-full bg-[#b5924d] shadow-[0_0_10px_#b5924d]" style={{ width: `${item.progress}%` }} />
          </div>
        )}

        {isChannel && (
          <div className={`absolute inset-x-0 bottom-0 p-4 bg-black/60 transition-transform backdrop-blur-md ${focused ? 'translate-y-0' : 'translate-y-full'}`}>
            <p className="text-[10px] text-center font-medium text-white truncate uppercase tracking-widest">{item.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusableRemoveButton({ onRemove, parentFocused }: any) {
  return (
    <button
      tabIndex={-1}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all z-[100] shadow-2xl backdrop-blur-md cursor-pointer
                 bg-black/60 text-white border border-white/10 hover:bg-[#b5924d] hover:text-black
                 ${parentFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}