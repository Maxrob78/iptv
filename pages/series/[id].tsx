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
import { fetchOmdbRating } from '../../utils/omdb';

export default function SeriesDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [showRating, setShowRating] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [omdbRating, setOmdbRating] = useState<string | null>(null);

  const focusSet = useRef(false);
  useEffect(() => {
    if (!loading && data && !focusSet.current) {
      setTimeout(() => {
        setFocus('BACK_BTN');
        focusSet.current = true;
      }, 300);
    }
  }, [loading, data]);

  const { getProfileData } = useDataStore();
  const { localLibrary } = getProfileData();
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean, ep: any, time: number }>({
    isOpen: false,
    ep: null,
    time: 0
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
    saveLastFocusedChild: true,
    trackChildren: true
  });

  const userRating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(id)]?.rating;
  });

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
    focusSet.current = false;

    if (id.toString().startsWith('local-')) {
      const realId = id.toString().replace('local-', '');
      const localItem = localLibrary.find((item: any) => item.id === realId);
      
      if (localItem) {
        const seasons = localItem.seasons || [{ season_number: "1" }];
        const episodes = localItem.episodes || { "1": [] };
        
        setData({
          info: {
            name: localItem.name,
            cover: localItem.cover,
            rating: localItem.rating,
            releaseDate: localItem.year,
            genre: localItem.tags?.[0] || 'Local Archive',
            plot: localItem.description
          },
          episodes: episodes,
          seasons: seasons
        });

        const firstSeason = seasons.find((s: any) => episodes[s.season_number]?.length > 0)?.season_number || "1";
        setSelectedSeason(firstSeason);
        setLoading(false);
      }
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const seriesInfo = await xtreamApi.getSeriesInfo(Number(id));
        setData(seriesInfo);
        
        let initialSeason = "";
        if (seriesInfo.seasons && seriesInfo.seasons.length > 0) {
          for (const s of seriesInfo.seasons) {
            const sNum = s.season_number?.toString();
            if (seriesInfo.episodes[sNum] && seriesInfo.episodes[sNum].length > 0) {
              initialSeason = sNum;
              break;
            }
          }
        } 
        
        if (!initialSeason && seriesInfo.episodes) {
          initialSeason = Object.keys(seriesInfo.episodes).find(k => seriesInfo.episodes[k].length > 0) || "";
        }

        setSelectedSeason(initialSeason || (seriesInfo.seasons?.[0]?.season_number?.toString()) || "1");
      } catch (err) {
        console.error("Erreur de récupération des détails de la série", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, localLibrary]);

  useEffect(() => {
    if (data && data.info) {
      const getRating = async () => {
        const rating = await fetchOmdbRating(
            data.info.name, 
            data.info.releaseDate || data.series_data?.year, 
            'series',
            data.info.imdb_id || data.series_data?.imdb_id
        );
        if (rating) setOmdbRating(rating);
      };
      getRating();
    }
  }, [data]);

  useEffect(() => {
    if (!loading && data && data.episodes) {
      const totalEpisodesCount = Object.values(data.episodes).reduce((acc: number, season: any) => acc + season.length, 0);
      const activeProfileId = useProfileStore.getState().activeProfile?.id;
      const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
      const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
      let updated = false;

      Object.values(history).forEach((item: any) => {
        if (item.type === 'series' && String(item.seriesId) === String(id)) {
          if (item.seriesTotalEpisodes !== totalEpisodesCount) {
            item.seriesTotalEpisodes = totalEpisodesCount;
            updated = true;
          }
        }
      });

      if (updated) {
        localStorage.setItem(historyKey, JSON.stringify(history));
        setPlaybackHistory(history);
      }
    }
  }, [loading, data, id]);

  if (loading || !data || !data.info) return (
    <div className="flex-1 flex bg-[#050505] text-white">
      <Sidebar />
      <div className="ml-20 lg:ml-72 3xl:ml-96 flex-1 flex items-center justify-center">
        <p className="text-[10px] uppercase font-bold tracking-[0.5em] animate-pulse text-[#b5924d]">Accès au Registre...</p>
      </div>
    </div>
  );

  const episodes = selectedSeason ? data.episodes[selectedSeason] : [];

  const parseCast = (castStr?: string) => {
    if (!castStr) return [];
    return castStr.split(',').map(s => s.trim()).filter(Boolean);
  };

  const actors = data.info ? parseCast(data.info.cast) : [];
  const directors = data.info ? parseCast(data.info.director) : [];


  const handlePlayEpisode = (ep: any, forcedStartTime?: number) => {
    if (launchingVideo) return; 
    const streamUrl = xtreamApi.getStreamUrl(ep.id, 'series', ep.container_extension || 'mkv');
    
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;
    
    if (history[ep.id] && forcedStartTime === undefined) {
      const savedTime = history[ep.id].currentTime;
      const progress = history[ep.id].progress || 0;
      if (progress > 1 && savedTime > 10) {
        setResumeModal({
            isOpen: true,
            ep,
            time: savedTime
        });
        return;
      }
    }

    if (history[ep.id as string] && forcedStartTime === 0) {
      history[ep.id as string].watched = false;
      history[ep.id as string].progress = 0;
      history[ep.id as string].currentTime = 0;
      localStorage.setItem(historyKey, JSON.stringify(history));
      setPlaybackHistory(history);
    }

    const totalEpisodesCount = Object.values(data.episodes).reduce((acc: number, season: any) => acc + season.length, 0);

    setLaunchingVideo(ep.title);
    
    if (!history[ep.id as string]) {
      history[ep.id as string] = {
        id: ep.id,
        currentTime: 0,
        duration: 100,
        progress: 1,
        watched: false,
        lastUpdated: Date.now(),
        type: 'series',
        title: ep.title,
        extension: ep.container_extension || 'mkv',
        seriesId: id,
        seriesTitle: data.info.name,
        seriesCover: data.info.cover,
        cover: data.info.cover
      };
    }

    history[ep.id as string].seriesTotalEpisodes = totalEpisodesCount;
    localStorage.setItem(historyKey, JSON.stringify(history));
    setPlaybackHistory(history);

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
          streamUrl,
          streamId: ep.id,
          title: ep.title,
          type: 'series',
          startTime: startTime
      });
    } else {
      router.push(`/player/${ep.id}?type=series&extension=${ep.container_extension}&title=${encodeURIComponent(ep.title)}&seriesId=${id}&seriesTitle=${encodeURIComponent(data.info.name)}&seriesCover=${encodeURIComponent(data.info.cover)}&start=${startTime}`);
    }

    setTimeout(() => setLaunchingVideo(null), 3000);
  };

  return (
    <div className="flex-1 flex bg-[#050505] text-white min-h-screen font-['Inter']">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-72 3xl:ml-96 flex-1 relative overflow-y-auto no-scrollbar pb-40">
        
        {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
                <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4 border border-white/20">
                    <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lancement : {launchingVideo}</span>
                </div>
            </div>
        )}
        <div className="absolute top-12 left-20 z-50 animate-in fade-in slide-in-from-left-10 duration-1000">
          <FocusableBackButton onClick={() => router.back()} />
        </div>

        <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-0 left-0 w-full h-[60vh] opacity-20 filter blur-[100px]">
                <img src={data.info.cover} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505] to-[#050505]" />
        </div>

        <div className="relative pt-40 px-20 z-10">
            <div className="flex items-center space-x-6 mb-12 animate-in fade-in slide-in-from-left-10 duration-1000">
                <div className="w-16 h-[1px] bg-[#b5924d]/40" />
                <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Série Exclusive</span>
            </div>
            
            <div className="flex flex-col lg:flex-row items-start lg:space-x-20">
                <div className="flex flex-col items-center mb-12 lg:mb-0">
                    <div className="w-64 aspect-[3/4.5] rounded-sm overflow-hidden ring-1 ring-white/10 shadow-2xl mb-8 animate-in zoom-in-95 duration-1000">
                        <img src={data.info.cover} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex justify-center w-full animate-in zoom-in-95 duration-1000">
                        <FavoriteDetailsButton item={{ ...data.info, stream_id: id, type: 'series' }} />
                    </div>
                </div>
                
                <div className="flex-1 max-w-4xl animate-in fade-in slide-in-from-right-10 duration-1000">
                    <h1 className="text-8xl font-extralight tracking-tight mb-8 leading-tight">
                        {data.info.name.split(' ').map((word: string, i: number) => (
                            <span key={i} className={i % 2 === 0 ? '' : 'opacity-30 italic font-serif'}>{word} </span>
                        ))}
                    </h1>
                    
                    <div className="flex flex-wrap items-center gap-4 mb-12">
                        {omdbRating ? (
                            <div className="flex items-center space-x-2 bg-[#f5c518]/20 px-3 py-1 rounded-sm border border-[#f5c518]/30">
                                <span className="bg-[#f5c518] text-black px-1 py-0.5 rounded-[2px] font-black tracking-normal text-[8px] shadow-sm">IMDb</span>
                                <span className="text-[#f5c518] font-bold text-sm">{omdbRating}</span>
                            </div>
                        ) : data.info.rating ? (
                            <div className="flex items-center space-x-2 bg-[#b5924d]/20 px-3 py-1 rounded-sm border border-[#b5924d]/30">
                                <span className="text-[#b5924d]">★</span>
                                <span className="text-[#b5924d] font-bold text-sm">{data.info.rating}</span>
                            </div>
                        ) : null}
                        
                        {userRating && (
                            <div className="flex items-center space-x-2 bg-blue-500/20 px-3 py-1 rounded-sm border border-blue-500/30 cursor-pointer hover:bg-blue-500/30 transition" onClick={() => setShowRating(true)}>
                                <span className="text-blue-400">★</span>
                                <span className="text-blue-400 font-bold text-sm">Vous : {userRating}/10</span>
                            </div>
                        )}
                        
                        {data.info.releaseDate && (
                            <span className="text-gray-400 text-sm font-medium">{data.info.releaseDate}</span>
                        )}
                        
                        {data.info.genre && (
                            <span className="text-gray-500 text-sm">{data.info.genre}</span>
                        )}
                    </div>

                    <p className="text-gray-500 text-lg font-light leading-relaxed max-w-2xl mb-12">
                        {data.info.plot || "Aucun synopsis disponible pour ce registre."}
                    </p>

                </div>
            </div>
        </div>

        <div className="px-20 relative z-10 mt-40 mb-20 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="flex items-center space-x-10 mb-10 overflow-x-auto no-scrollbar pb-6 mask-fade-right">
                {data.seasons && data.seasons.filter((s: any) => {
                    const sNum = s.season_number?.toString();
                    return data.episodes[sNum] && data.episodes[sNum].length > 0;
                }).map((s: any) => (
                    <FocusableSeasonButton 
                        key={s.season_number}
                        s={s}
                        focusKey={`SEASON_${s.season_number}`}
                        isActive={selectedSeason === s.season_number.toString()}
                        onClick={() => setSelectedSeason(s.season_number.toString())}
                    />
                ))}
            </div>
            <div className="w-full h-[1px] bg-white/5" />
        </div>

        <div className="px-20 relative z-10 pt-10">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12">
                {episodes && episodes.map((ep: any, index: number) => (
                    <FocusableEpisodeCard 
                        key={ep.id}
                        ep={ep}
                        index={index}
                        focusKey={`EPISODE_${ep.id}`}
                        history={playbackHistory[ep.id as string]}
                        onClick={handlePlayEpisode}
                    />
                ))}
            </div>
            
            {(!episodes || episodes.length === 0) && (
                <div className="py-20 text-center">
                    <p className="text-gray-700 text-[10px] font-medium uppercase tracking-[0.6em]">Aucune archives détectée pour cette saison.</p>
                </div>
            )}
        </div>

        {/* Cast & Crew Section (Moved to bottom) */}
        {(actors.length > 0 || directors.length > 0) && (
            <div className="px-20 relative z-10 pb-32">
                <div className="border-t border-white/10 pt-10">
                    <h3 className="text-sm font-medium uppercase tracking-[0.4em] text-gray-500 mb-6">Casting & Équipe</h3>
                    <div className="flex flex-wrap items-center gap-4">
                        {directors.map((dir, idx) => (
                        <ActorBadge key={`dir-${idx}`} name={dir} role="Réalisateur" onClick={() => setSelectedActor(dir)} sidebarFocusKey="NAV_SERIES" />
                        ))}
                        {actors.map((actor, idx) => (
                        <ActorBadge key={`act-${idx}`} name={actor} onClick={() => setSelectedActor(actor)} sidebarFocusKey="NAV_SERIES" />
                        ))}
                    </div>
                </div>
            </div>
        )}

        <ResumeModal 
            isOpen={resumeModal.isOpen}
            title={resumeModal.ep?.title || ''}
            time={resumeModal.time}
            onClose={() => {
                setResumeModal({ ...resumeModal, isOpen: false });
                if (resumeModal.ep) setTimeout(() => setFocus(`EPISODE_${resumeModal.ep.id}`), 100);
            }}
            onConfirm={() => {
                const { ep, time } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
                setTimeout(() => setFocus(`EPISODE_${ep.id}`), 100);
                handlePlayEpisode(ep, time);
            }}
            onStartOver={() => {
                const { ep } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
                setTimeout(() => setFocus(`EPISODE_${ep.id}`), 100);
                handlePlayEpisode(ep, 0);
            }}
        />
      </main>
      </FocusContext.Provider>
      
      {showRating && (
        <RatingModal 
          item={{ id, name: data?.info?.name, stream_id: id }} 
          onClose={() => {
            setShowRating(false);
            setFocus('RATE_SERIES_BTN');
          }} 
        />
      )}

      {selectedActor && (
          <ActorModal
              actorName={selectedActor}
              onClose={() => setSelectedActor(null)}
          />
      )}

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .mask-fade-right { mask-image: linear-gradient(to right, black 95%, transparent 100%); }
      `}</style>
    </div>
  );
}

function FocusableBackButton({ onClick }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: 'BACK_BTN',
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'up') return false;
      if (direction === 'right') return false;
      if (direction === 'down') {
        setFocus('RATE_SERIES_BTN');
        return false;
      }
      if (direction === 'left') {
        setFocus('NAV_SERIES');
        return false;
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
      className={`flex items-center space-x-6 text-white group/back transition-all duration-300 ${focused ? 'scale-110' : ''}`}
    >
      <div className={`backdrop-blur-xl p-5 rounded-full border shadow-2xl transition-all duration-700 
                      ${focused ? 'bg-[#b5924d] text-black border-[#b5924d] shadow-[0_0_40px_rgba(181,146,77,0.5)]' : 'bg-white/5 border-white/10'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7"/></svg>
      </div>
      <span className={`text-[10px] font-medium uppercase tracking-[0.6em] transition-opacity uppercase ${focused ? 'opacity-100 text-[#b5924d]' : 'opacity-40'}`}>Retour</span>
    </button>
  );
}

function FocusableSeasonButton({ s, isActive, onClick, focusKey: customFocusKey }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'up') {
        setFocus('RATE_SERIES_BTN');
        return false;
      }
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_SERIES');
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
  const sNum = s.season_number?.toString();

  return (
    <button 
        ref={ref}
        onClick={onClick}
        onMouseEnter={(e: any) => {
          if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
            (window as any).lastMouseX = e.clientX;
            (window as any).lastMouseY = e.clientY;
            (window as any).isMouseFocus = true;
            setFocus(focusKey);
            setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
          }
        }}
        className="flex-shrink-0 group relative outline-none px-8 py-4"
    >
        <div className={`flex flex-col items-center transition-all duration-500 ${focused ? 'scale-110' : ''}`}>
            <span className={`text-6xl font-extralight tracking-tighter transition-all duration-500 
                           ${focused ? 'text-[#b5924d]' : isActive ? 'text-white' : 'text-gray-700'}`}>
                {sNum.padStart(2, '0')}
            </span>
            
            <div className="h-6 flex items-center justify-center mt-2">
              {focused ? (
                <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-[#b5924d] animate-in fade-in slide-in-from-bottom-2 duration-300">
                  Saison
                </span>
              ) : isActive ? (
                <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />
              ) : null}
            </div>

            {focused && (
                <div className="absolute -bottom-1 w-1 h-1 bg-[#b5924d] rounded-full shadow-[0_0_15px_#b5924d]" />
            )}
        </div>
    </button>
  );
}

function FocusableEpisodeCard({ ep, history, onClick, focusKey: customFocusKey, index }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: () => onClick(ep),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_SERIES');
          return false;
        }
      }
      if (direction === 'up') {
        const columns = window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1;
        if (index < columns) {
          setFocus(`SEASON_${ep.season || 1}`);
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

  const isWatched = history?.watched || (history?.progress && history.progress >= 95);
  const progress = history?.progress || 0;

  return (
    <div 
        ref={ref}
        onClick={() => onClick(ep)}
        onMouseEnter={(e: any) => {
          if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
            (window as any).lastMouseX = e.clientX;
            (window as any).lastMouseY = e.clientY;
            (window as any).isMouseFocus = true;
            setFocus(focusKey);
            setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
          }
        }}
        className={`group relative border rounded-sm p-12 cursor-pointer transition-all duration-500
                   ${focused ? 'bg-[#b5924d]/10 border-[#b5924d] -translate-y-2 shadow-[0_20px_40px_rgba(181,146,77,0.2)]' : 'bg-white/[0.02] border-white/5'}`}
    >
        <div className="flex items-center space-x-10">
            <div className={`w-20 h-20 shrink-0 border rounded-full flex items-center justify-center transition-all duration-500
                           ${focused ? 'bg-[#b5924d] border-[#b5924d] shadow-[0_0_40px_rgba(181,146,77,0.5)]' : 'border-[#b5924d]/30'}`}>
                <svg className={`w-6 h-6 transition-colors ${focused ? 'text-black' : 'text-[#b5924d]'}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0 pr-10">
                <p className={`text-[11px] font-bold uppercase tracking-[0.5em] mb-3 transition-colors ${focused ? 'text-white' : 'text-[#b5924d]'}`}>Épisode {ep.episode_num}</p>
                <h3 className="text-xl font-extralight text-white line-clamp-3 transition-colors leading-tight">{ep.title}</h3>
            </div>
        </div>

        {/* Status Badges */}
        {isWatched ? (
            <div className="absolute top-6 right-6 flex items-center space-x-2 animate-in fade-in duration-1000">
                <span className="text-[7px] font-bold text-[#b5924d] uppercase tracking-widest opacity-60">VU</span>
                <div className="w-1 h-1 bg-[#b5924d] rounded-full shadow-[0_0_5px_#b5924d]" />
            </div>
        ) : progress > 1 ? (
            <div className="absolute top-6 right-6 flex items-center space-x-2 animate-pulse">
                <span className="text-[7px] font-bold text-white/30 uppercase tracking-widest">En Cours</span>
            </div>
        ) : null}

        {/* Discrete Progress Line */}
        {progress > 1 && !isWatched && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/[0.03]">
                <div className="h-full bg-[#b5924d] shadow-[0_0_10px_#b5924d]" style={{ width: `${progress}%` }} />
            </div>
        )}
    </div>
  );
}

function FavoriteDetailsButton({ item }: { item: any }) {
  const { isFavorite } = useDataStore();
  const [showFavModal, setShowFavModal] = useState(false);
  const { ref, focused } = useFocusable({
    focusKey: 'RATE_SERIES_BTN',
    onEnterPress: () => setShowFavModal(true),
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_SERIES');
        return false;
      }
      return true;
    }
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
            setFocus('RATE_SERIES_BTN');
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
            setFocus('RATE_SERIES_BTN');
          }}
        />
      )}
    </>
  );
}

function FocusableAction({ children, onClick, focusKey: customFocusKey }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'up') {
        setFocus('BACK_BTN');
        return false;
      }
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_SERIES');
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      if (!(window as any).isMouseFocus) {
        ref.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
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
          (window as any).isMouseFocus = true;
          setFocus(focusKey);
          setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
        }
      }}
      className={`flex items-center px-6 py-4 rounded-xl border backdrop-blur-xl transition-all duration-300 font-bold uppercase text-[10px] tracking-widest
                 ${focused ? 'bg-[#b5924d] text-black border-[#b5924d] scale-110 shadow-[0_0_40px_rgba(181,146,77,0.5)]' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
    >
      {children}
    </button>
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
