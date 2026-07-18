import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi } from '../../utils/xtream';
import { Sidebar } from '../../components/Sidebar';
import { useDataStore } from '../../store/useDataStore';
import { useProfileStore } from '../../store/useProfileStore';
import { ResumeModal } from '../../components/ResumeModal';
import RatingModal from '../../components/RatingModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useRatingStore } from '../../store/useRatingStore';

export default function SeriesDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => {
        setFocus('BACK_BTN');
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

  if (loading || !data || !data.info) return (
    <div className="flex-1 flex bg-[#050505] text-white">
      <Sidebar />
      <div className="ml-20 lg:ml-72 flex-1 flex items-center justify-center">
        <p className="text-[10px] uppercase font-bold tracking-[0.5em] animate-pulse text-[#b5924d]">Accès au Registre...</p>
      </div>
    </div>
  );

  const episodes = selectedSeason ? data.episodes[selectedSeason] : [];


  const handlePlayEpisode = (ep: any, forcedStartTime?: number) => {
    if (launchingVideo) return; 
    const streamUrl = xtreamApi.getStreamUrl(ep.id, 'series', ep.container_extension || 'mkv');
    
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;
    
    if (history[ep.id] && forcedStartTime === undefined) {
      const savedTime = history[ep.id].currentTime;
      if (savedTime > 10) {
        setResumeModal({
            isOpen: true,
            ep,
            time: savedTime
        });
        return;
      }
    }

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
      localStorage.setItem(historyKey, JSON.stringify(history));
      setPlaybackHistory(history);
    }

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
        <main ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar pb-40">
        
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
                <div className="w-64 aspect-[3/4.5] rounded-sm overflow-hidden ring-1 ring-white/10 shadow-2xl mb-12 lg:mb-0 animate-in zoom-in-95 duration-1000">
                    <img src={data.info.cover} className="w-full h-full object-cover" alt="" />
                </div>
                
                <div className="flex-1 max-w-4xl animate-in fade-in slide-in-from-right-10 duration-1000">
                    <h1 className="text-8xl font-extralight tracking-tight mb-8 leading-tight">
                        {data.info.name.split(' ').map((word: string, i: number) => (
                            <span key={i} className={i % 2 === 0 ? '' : 'opacity-30 italic font-serif'}>{word} </span>
                        ))}
                    </h1>
                    
                    <div className="flex items-center space-x-8 mb-12 text-[10px] font-bold tracking-[0.3em] text-[#b5924d]">
                        <div className="flex items-center space-x-2">
                             <span className="text-white opacity-40">SCORE</span>
                             <span>{data.info.rating || '8.5'}/10</span>
                             {userRating && (
                               <>
                                 <span className="text-white opacity-40 ml-4">MA NOTE</span>
                                 <span className="text-[#b5924d]">{userRating}/10</span>
                               </>
                             )}
                        </div>
                        <span className="w-1.5 h-1.5 bg-white/10 rounded-full" />
                        <span>{data.info.releaseDate || '2024'}</span>
                        <span className="w-1.5 h-1.5 bg-white/10 rounded-full" />
                        <span className="text-white opacity-40 uppercase">{data.info.genre || 'MASTERPIECE'}</span>
                    </div>

                    <p className="text-gray-500 text-lg font-light leading-relaxed max-w-2xl mb-12">
                        {data.info.plot || "Aucun synopsis disponible pour ce registre."}
                    </p>

                    <div className="flex items-center space-x-4">
                        <FocusableAction 
                            focusKey="RATE_SERIES_BTN"
                            onClick={() => setShowRating(true)}
                        >
                            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                            Noter la série
                        </FocusableAction>
                    </div>
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

        <ResumeModal 
            isOpen={resumeModal.isOpen}
            title={resumeModal.ep?.title || ''}
            time={resumeModal.time}
            onClose={() => setResumeModal({ ...resumeModal, isOpen: false })}
            onConfirm={() => {
                const { ep, time } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
                handlePlayEpisode(ep, time);
            }}
            onStartOver={() => {
                const { ep } = resumeModal;
                setResumeModal({ ...resumeModal, isOpen: false });
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

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .mask-fade-right { mask-image: linear-gradient(to right, black 80%, transparent 100%); }
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
      onMouseEnter={() => setFocus(focusKey)}
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

function FocusableEpisodeCard({ ep, history, onClick, focusKey: customFocusKey }: any) {
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
      return true;
    },
    onFocus: () => {
      if (!(window as any).isMouseFocus) {
        ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    }
  });

  const isWatched = history?.watched;
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
        ) : progress > 0 ? (
            <div className="absolute top-6 right-6 flex items-center space-x-2 animate-pulse">
                <span className="text-[7px] font-bold text-white/30 uppercase tracking-widest">En Cours</span>
            </div>
        ) : null}

        {/* Discrete Progress Line */}
        {progress > 0 && !isWatched && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/[0.03]">
                <div className="h-full bg-[#b5924d] shadow-[0_0_10px_#b5924d]" style={{ width: `${progress}%` }} />
            </div>
        )}
    </div>
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
