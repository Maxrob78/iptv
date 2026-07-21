import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi } from '../../utils/xtream';
import { Sidebar } from '../../components/Sidebar';
import { useDataStore } from '../../store/useDataStore';
import { useProfileStore } from '../../store/useProfileStore';
import { ResumeModal } from '../../components/ResumeModal';
import RatingModal from '../../components/RatingModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useRatingStore } from '../../store/useRatingStore';
import { ActorModal } from '../../components/ActorModal';
import FavoriteModal from '../../components/FavoriteModal';

export default function MovieDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [showRating, setShowRating] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  const { getProfileData } = useDataStore();
  const { localLibrary } = getProfileData();
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean, item: any, time: number }>({
    isOpen: false,
    item: null,
    time: 0
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'MOVIE_MAIN_CONTENT',
    saveLastFocusedChild: true,
    trackChildren: true
  });

  const userRating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(id)]?.rating;
  });

  const focusSet = useRef(false);
  useEffect(() => {
    if (!loading && data && !focusSet.current) {
      setTimeout(() => {
        setFocus('MOVIE_BACK_BTN');
        focusSet.current = true;
      }, 300);
    }
  }, [loading, data]);

  useEffect(() => {
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    setPlaybackHistory(history);

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
                setPlaybackHistory(currentHistory);
            }
        });

        const removeStatus = (window as any).electronAPI.on('mpv-status', (data: any) => {
            if (data.status === 'completed') {
                const activeId = useProfileStore.getState().activeProfile?.id;
                const key = activeId ? `iptv_playback_history_${activeId}` : 'iptv_playback_history';
                const currentHistory = JSON.parse(localStorage.getItem(key) || '{}');
                if (currentHistory[data.streamId]) {
                    currentHistory[data.streamId].progress = 100;
                    currentHistory[data.streamId].watched = true;
                    localStorage.setItem(key, JSON.stringify(currentHistory));
                    setPlaybackHistory(currentHistory);
                }
            }
        });

        return () => {
            removeProgress();
            removeStatus();
        };
    }
  }, []);

  useEffect(() => {
    if (!id) return;

    if (id.toString().startsWith('local-')) {
      const realId = id.toString().replace('local-', '');
      const localItem = localLibrary.find((item: any) => item.id === realId);
      
      if (localItem) {
        setData({
          info: {
            name: localItem.name,
            cover: localItem.cover,
            rating: localItem.rating,
            releaseDate: localItem.year,
            genre: localItem.tags?.[0] || 'Local Archive',
            plot: localItem.description
          },
          movie_data: localItem
        });
        setLoading(false);
      }
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const vodInfo = await xtreamApi.getVodInfo(Number(id));
        setData(vodInfo);
      } catch (err) {
        console.error("Erreur de récupération des détails du film", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, localLibrary]);

  if (loading || !data || !data.info) return (
    <div className="flex-1 flex bg-[#050505] text-white">
      <Sidebar />
      <div className="ml-20 lg:ml-72 flex-1 flex items-center justify-center">
        <p className="text-[10px] uppercase font-bold tracking-[0.5em] animate-pulse text-[#b5924d]">Accès au Registre...</p>
      </div>
    </div>
  );

  const handlePlayMovie = (forcedStartTime?: number) => {
    if (launchingVideo) return; 
    
    const movieData = data.movie_data || data.info; // Support local structure
    const streamUrl = xtreamApi.getStreamUrl(movieData.stream_id || id, 'movie', movieData.container_extension || 'mkv');
    
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;
    
    const streamId = String(movieData.stream_id || id);

    if (history[streamId] && forcedStartTime === undefined) {
      const savedTime = history[streamId].currentTime;
      const progress = history[streamId].progress || 0;
      if (progress > 1 && savedTime > 10) {
        setResumeModal({
            isOpen: true,
            item: movieData,
            time: savedTime
        });
        return;
      }
    }

    if (history[streamId] && forcedStartTime === 0) {
      history[streamId].watched = false;
      history[streamId].progress = 0;
      history[streamId].currentTime = 0;
      localStorage.setItem(historyKey, JSON.stringify(history));
      setPlaybackHistory(history);
    }

    setLaunchingVideo(data.info.name || movieData.name);
    
    if (!history[streamId]) {
      history[streamId] = {
        id: streamId,
        currentTime: 0,
        duration: 100,
        progress: 1,
        watched: false,
        lastUpdated: Date.now(),
        type: 'movie',
        title: data.info.name || movieData.name,
        extension: movieData.container_extension || 'mkv',
        cover: data.info.cover || data.info.movie_image || ''
      };
      localStorage.setItem(historyKey, JSON.stringify(history));
    }

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
        streamUrl: streamUrl,
        title: data.info.name || movieData.name,
        startTime: startTime,
        streamId: streamId,
        type: 'movie'
      });
      setTimeout(() => setLaunchingVideo(null), 2000);
    } else {
      console.log("Lecture Web:", streamUrl);
      setTimeout(() => setLaunchingVideo(null), 1000);
    }
  };

  const parseCast = (castStr?: string) => {
    if (!castStr) return [];
    return castStr.split(',').map(s => s.trim()).filter(Boolean);
  };

  const actors = parseCast(data.info.cast);
  const directors = parseCast(data.info.director);
  const historyData = playbackHistory[String(id)];

  const getDisplayDuration = () => {
    if (data.info.duration && typeof data.info.duration === 'string') {
        const d = data.info.duration.trim().toLowerCase();
        if (d.includes(':')) {
            const parts = d.split(':');
            if (parts.length === 3) {
                const m = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                if (m > 0) return `${m} min`;
            }
        }
        if (d.includes('h')) {
             const parts = d.split('h');
             const h = parseInt(parts[0]) || 0;
             const m = parseInt(parts[1]) || 0;
             if (h > 0 || m > 0) return `${h * 60 + m} min`;
        }
        const parsed = parseInt(d);
        if (!isNaN(parsed) && parsed > 0) {
            if (parsed > 500) return `${Math.round(parsed / 60)} min`;
            return `${parsed} min`;
        }
    }
    
    if (data.info.duration_secs > 0) {
        let mins = Math.round(data.info.duration_secs / 60);
        if (mins < 10 && data.info.duration_secs >= 20) {
            mins = data.info.duration_secs;
        }
        if (mins > 0) return `${mins} min`;
    }
    return null;
  };

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white selection:bg-[#b5924d]/30 font-['Inter']">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main id="main-scroll" ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar pb-32">

          {/* Notifications */}
          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lancement : {launchingVideo}</span>
              </div>
            </div>
          )}

          {/* Background Flouté */}
          <div className="fixed inset-0 z-0 w-full h-[70vh]">
            <img 
              src={data.info.cover || data.info.movie_image} 
              alt="Cover" 
              className="w-full h-full object-cover opacity-30"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/50 to-transparent" />
          </div>

          <div className="absolute top-12 left-12 z-50 animate-in fade-in slide-in-from-left-10 duration-1000">
            <FocusableBackButton onClick={() => router.back()} />
          </div>

          <div className="relative z-10 px-12 pt-32 max-w-[95%] animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="flex flex-col md:flex-row gap-16">
              {/* Poster */}
              <div className="w-72 flex-shrink-0">
                <div className="aspect-[3/4.5] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative">
                  <img 
                    src={data.info.cover || data.info.movie_image} 
                    alt={data.info.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {historyData && historyData.watched && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                        <span className="text-white text-[10px] font-bold tracking-[0.4em] uppercase border border-white/20 px-4 py-2 rounded-full">Vu</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Infos */}
              <div className="flex-1 pt-4">
                <div className="flex items-center space-x-4 mb-6">
                  {data.info.rating && (
                    <div className="flex items-center space-x-2 bg-[#b5924d]/20 px-3 py-1 rounded-sm border border-[#b5924d]/30">
                      <span className="text-[#b5924d]">★</span>
                      <span className="text-[#b5924d] font-bold text-sm">{data.info.rating}</span>
                    </div>
                  )}
                  {userRating && (
                    <div className="flex items-center space-x-2 bg-blue-500/20 px-3 py-1 rounded-sm border border-blue-500/30 cursor-pointer hover:bg-blue-500/30 transition" onClick={() => setShowRating(true)}>
                        <span className="text-blue-400">★</span>
                        <span className="text-blue-400 font-bold text-sm">Vous : {userRating}/10</span>
                    </div>
                  )}
                  {data.info.releaseDate && (
                    <span className="text-gray-400 text-sm font-medium">{data.info.releaseDate}</span>
                  )}
                  {getDisplayDuration() && (
                    <span className="text-gray-400 text-sm font-medium">{getDisplayDuration()}</span>
                  )}
                  {data.info.genre && (
                    <span className="text-gray-500 text-sm">{data.info.genre}</span>
                  )}
                </div>

                <h1 className="text-6xl font-extralight tracking-tight mb-8 leading-tight">
                  {data.info.name}
                </h1>

                <p className="text-gray-400 text-lg leading-relaxed max-w-3xl mb-12 font-light">
                  {data.info.plot || data.info.description || "Aucun synopsis disponible."}
                </p>

                {historyData && historyData.progress > 1 && historyData.progress < 90 && (
                    <div className="mb-10 max-w-md">
                        <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
                            <span>Reprise</span>
                            <span>{Math.round(historyData.progress)}%</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-[#b5924d] rounded-full transition-all duration-1000"
                                style={{ width: `${historyData.progress}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex items-center space-x-6">
                  <PlayButton 
                    onClick={() => handlePlayMovie()} 
                    text={historyData?.progress > 1 && historyData?.progress < 90 ? "Reprendre" : "Lancer le film"} 
                  />
                  
                  {data.info.youtube_trailer && (
                    <TrailerButton videoId={data.info.youtube_trailer} />
                  )}

                  <FavoriteDetailsButton item={data.movie_data || { ...data.info, stream_id: id }} />
                </div>

                {/* Cast & Crew Section */}
                {(actors.length > 0 || directors.length > 0) && (
                  <div className="mt-16 border-t border-white/10 pt-10">
                    <h3 className="text-sm font-medium uppercase tracking-[0.4em] text-gray-500 mb-6">Casting & Équipe</h3>
                    <div className="flex flex-wrap items-center gap-4">
                      {directors.map((dir, idx) => (
                        <ActorBadge key={`dir-${idx}`} name={dir} role="Réalisateur" onClick={() => setSelectedActor(dir)} sidebarFocusKey="NAV_MOVIES" />
                      ))}
                      {actors.map((actor, idx) => (
                        <ActorBadge key={`act-${idx}`} name={actor} onClick={() => setSelectedActor(actor)} sidebarFocusKey="NAV_MOVIES" />
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          <ResumeModal 
            isOpen={resumeModal.isOpen}
            title={resumeModal.item?.name || ''}
            time={resumeModal.time}
            onClose={() => setResumeModal({ ...resumeModal, isOpen: false })}
            onConfirm={() => {
                const { item, time } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
                handlePlayMovie(time);
            }}
            onStartOver={() => {
                const { item } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
                handlePlayMovie(0);
            }}
          />

          {showRating && (
              <RatingModal
                  item={data.movie_data || { ...data.info, stream_id: id }}
                  onClose={() => setShowRating(false)}
              />
          )}

          {selectedActor && (
              <ActorModal
                  actorName={selectedActor}
                  onClose={() => setSelectedActor(null)}
              />
          )}

        </main>
      </FocusContext.Provider>
    </div>
  );
}

function PlayButton({ onClick, text }: { onClick: () => void, text: string }) {
  const { ref, focused } = useFocusable({
    focusKey: 'MOVIE_PLAY_BTN',
    onEnterPress: onClick,
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus('MOVIE_PLAY_BTN');
        }
      }}
      className={`px-12 py-5 rounded-sm font-bold text-[11px] uppercase tracking-[0.4em] transition-all duration-300 flex items-center space-x-4
                 ${focused ? 'bg-white text-black scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)]' : 'bg-[#b5924d] text-black hover:bg-white hover:text-black'}`}
    >
      <span className="text-lg">▶</span>
      <span>{text}</span>
    </button>
  );
}

function TrailerButton({ videoId }: { videoId: string }) {
  const { ref, focused } = useFocusable({
    focusKey: 'MOVIE_TRAILER_BTN',
    onEnterPress: () => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank'),
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  });

  return (
    <button
      ref={ref}
      onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus('MOVIE_TRAILER_BTN');
        }
      }}
      className={`px-10 py-5 rounded-sm font-bold text-[11px] uppercase tracking-[0.4em] transition-all duration-300 border
                 ${focused ? 'bg-white text-black border-white scale-105' : 'border-white/20 text-white hover:bg-white/10'}`}
    >
      Bande-Annonce
    </button>
  );
}

function FavoriteDetailsButton({ item }: { item: any }) {
  const { isFavorite } = useDataStore();
  const [showFavModal, setShowFavModal] = useState(false);
  const { ref, focused } = useFocusable({
    focusKey: 'MOVIE_FAVORITE_BTN',
    onEnterPress: () => setShowFavModal(true),
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  });

  const itemId = item.stream_id || item.series_id || item.id;
  const isFavorited = isFavorite(itemId);

  return (
    <>
      <button
        ref={ref}
        onClick={() => setShowFavModal(true)}
        onMouseEnter={(e: any) => {
          if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
            (window as any).lastMouseX = e.clientX;
            (window as any).lastMouseY = e.clientY;
            setFocus('MOVIE_FAVORITE_BTN');
          }
        }}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300 border
                   ${focused ? 'bg-white text-black border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'border-white/20 text-white hover:bg-white/10'}`}
        title="Ajouter aux favoris"
      >
        <svg className="w-5 h-5" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
      {showFavModal && (
        <FavoriteModal
          item={item}
          onClose={() => {
            setShowFavModal(false);
            setFocus('MOVIE_FAVORITE_BTN');
          }}
        />
      )}
    </>
  );
}

function ActorBadge({ name, role, onClick, sidebarFocusKey }: { name: string, role?: string, onClick: () => void, sidebarFocusKey?: string }) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: `ACTOR_BADGE_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'left' && sidebarFocusKey) {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus(sidebarFocusKey);
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);
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
      className={`px-4 py-2 rounded-full border transition-all duration-300 text-sm flex flex-col items-center
                 ${focused ? 'bg-white text-black border-white scale-105 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}
    >
      <span className="font-medium">{name}</span>
      {role && <span className="text-[9px] uppercase tracking-wider opacity-70 mt-0.5">{role}</span>}
    </button>
  );
}

function FocusableBackButton({ onClick }: { onClick: () => void }) {
  const { ref, focused } = useFocusable({
    focusKey: 'MOVIE_BACK_BTN',
    onEnterPress: onClick,
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('SIDEBAR');
        return false;
      }
      if (direction === 'up') return false;
      return true;
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
          setFocus('MOVIE_BACK_BTN');
        }
      }}
      className={`w-14 h-14 flex items-center justify-center rounded-full transition-all duration-300
                 ${focused ? 'bg-white text-black scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)] z-50' : 'bg-[#0a0a0a] border border-white/10 text-white hover:bg-white/10'}`}
    >
      <span className="text-4xl font-light leading-none mb-2 mr-1">‹</span>
    </button>
  );
}
