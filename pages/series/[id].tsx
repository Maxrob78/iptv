import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi } from '../../utils/xtream';
import { Sidebar } from '../../components/Sidebar';
import { useDataStore, dataStorage } from '../../store/useDataStore';
import { useProfileStore } from '../../store/useProfileStore';
import { ResumeModal } from '../../components/ResumeModal';
import RatingModal from '../../components/RatingModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useRatingStore } from '../../store/useRatingStore';
import { ActorModal } from '../../components/ActorModal';
import FavoriteModal from '../../components/FavoriteModal';
import { fetchOmdbRating } from '../../utils/omdb';
import { fetchLetterboxdRating } from '../../utils/letterboxd';
import { fetchRegelegorillaRating } from '../../utils/regelegorilla';
import { fetchTmdbDetails } from '../../utils/tmdb';

export default function SeriesDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [showRating, setShowRating] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [omdbRating, setOmdbRating] = useState<string | null>(null);
  const [letterboxdRating, setLetterboxdRating] = useState<string | null>(null);
  const [regelegorillaRating, setRegelegorillaRating] = useState<string | null>(null);

  const cleanId = id ? (Array.isArray(id) ? String(id[0]) : String(id)) : '';

  const fallbackSeries = React.useMemo(() => {
    if (!cleanId || cleanId.startsWith('local-')) return null;
    const storeSeries = useDataStore.getState().series || [];
    const storeFavorites = useDataStore.getState().getProfileData()?.favorites || [];
    const match = 
      storeSeries.find((s: any) => String(s.series_id || s.id) === cleanId) ||
      storeFavorites.find((f: any) => String(f.series_id || f.id) === cleanId);
    if (match) {
      return {
        series_id: cleanId,
        name: match.name || match.title || '',
        cover: match.cover || match.stream_icon || match.poster || '',
        rating: match.rating || '',
        year: match.year || match.releaseDate || ''
      };
    }
    return null;
  }, [cleanId]);

  const isValidSeriesInfo = (info: any) => {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return false;
    return Boolean(info.name || info.title || info.cover || info.movie_image);
  };

  const hasValidData = Boolean(data && isValidSeriesInfo(data.info));

  const focusSet = useRef(false);
  useEffect(() => {
    if (!loading && hasValidData && !focusSet.current) {
      setTimeout(() => {
        setFocus('BACK_BTN');
        focusSet.current = true;
      }, 300);
    } else if (loading && !hasValidData) {
      setTimeout(() => {
        setFocus('SERIES_LOADING_CANCEL');
      }, 100);
    } else if (loadError && !hasValidData) {
      setTimeout(() => {
        setFocus('SERIES_ERROR_BACK');
      }, 100);
    }
  }, [loading, hasValidData, loadError]);

  // Écouteur direct des touches retour pendant le chargement ou l'erreur
  useEffect(() => {
    const handleBackDuringLoading = (e: KeyboardEvent) => {
      const isBack = 
        e.key === 'Escape' || 
        e.key === 'Backspace' || 
        e.key === 'GoBack' || 
        e.key === 'Return' || 
        e.keyCode === 10009 || 
        e.keyCode === 461 || 
        e.keyCode === 4 ||
        e.which === 10009 ||
        e.which === 461 ||
        e.which === 4;

      if (isBack && (loading || loadError || !hasValidData)) {
        router.back();
      }
    };
    window.addEventListener('keydown', handleBackDuringLoading);
    return () => window.removeEventListener('keydown', handleBackDuringLoading);
  }, [loading, loadError, hasValidData, router]);

  const { getProfileData } = useDataStore();
  const { localLibrary } = getProfileData();
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean, ep: any, time: number }>({
    isOpen: false,
    ep: null,
    time: 0
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'SERIES_MAIN_CONTENT',
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

  const userRating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[cleanId]?.rating;
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
            if (data.status === 'error') {
                setLaunchingVideo(null);
            }
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
    if (!cleanId) return;
    focusSet.current = false;

    // Réinitialiser les états immédiatement pour éviter d'afficher les épisodes ou synopsis d'une autre série
    setData(null);
    setLoading(true);
    setLoadError(null);
    setSelectedSeason(null);
    setOmdbRating(null);
    setLetterboxdRating(null);
    setRegelegorillaRating(null);

    if (cleanId.startsWith('local-')) {
      const realId = cleanId.replace('local-', '');
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
      setLoadError(null);

      // 1. Tenter de charger immédiatement depuis le cache IndexedDB
      try {
        const cached = await dataStorage.getItem<any>(`cached_series_${cleanId}`);
        const hasFullEpisodes = cached && isValidSeriesInfo(cached.info) && cached.episodes && Object.keys(cached.episodes).length > 0;
        if (hasFullEpisodes) {
          setData(cached);
          const firstSeason = cached.seasons?.find((s: any) => cached.episodes?.[s.season_number]?.length > 0)?.season_number || Object.keys(cached.episodes)[0] || "1";
          setSelectedSeason(firstSeason);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } catch {
        setLoading(true);
      }

      let isTimedOut = false;
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        setData((current: any) => {
          if (!current || !isValidSeriesInfo(current.info)) {
            setLoadError("Le serveur IPTV met trop de temps à répondre (Délai d'attente dépassé).");
          }
          return current;
        });
        setLoading(false);
      }, 12000);

      try {
        const seriesInfo = await xtreamApi.getSeriesInfo(Number(cleanId));
        if (isTimedOut) return;
        clearTimeout(timeoutId);

        if (seriesInfo && isValidSeriesInfo(seriesInfo.info)) {
          if (!seriesInfo.info.name && fallbackSeries?.name) {
            seriesInfo.info.name = fallbackSeries.name;
          }
          if (!seriesInfo.info.cover && !seriesInfo.info.movie_image && fallbackSeries?.cover) {
            seriesInfo.info.cover = fallbackSeries.cover;
          }

          setData(seriesInfo);
          setLoading(false);
          setLoadError(null);
          dataStorage.setItem(`cached_series_${cleanId}`, seriesInfo).catch(() => {});

          const seriesCover = seriesInfo.info?.cover || seriesInfo.info?.movie_image;
          if (seriesCover) {
            useDataStore.getState().updateItemCover(cleanId, seriesCover);
          }
          
          let initialSeason = "";
          if (seriesInfo.seasons && seriesInfo.seasons.length > 0) {
            for (const s of seriesInfo.seasons) {
              const sNum = s.season_number?.toString();
              if (seriesInfo.episodes?.[sNum] && seriesInfo.episodes[sNum].length > 0) {
                initialSeason = sNum;
                break;
              }
            }
          } 
          
          if (!initialSeason && seriesInfo.episodes) {
            initialSeason = Object.keys(seriesInfo.episodes).find(k => seriesInfo.episodes[k].length > 0) || "";
          }

          setSelectedSeason(initialSeason || (seriesInfo.seasons?.[0]?.season_number?.toString()) || "1");

          // EN TEMPS RÉEL : Si synopsis ou casting manquant dans l'IPTV, enrichir via TMDB
          const hasPlot = Boolean(seriesInfo.info.plot && seriesInfo.info.plot.trim());
          const hasCast = Boolean(seriesInfo.info.cast && seriesInfo.info.cast.trim());
          if (!hasPlot || !hasCast) {
            const seriesName = seriesInfo.info.name || fallbackSeries?.name;
            const seriesYear = seriesInfo.info.releaseDate || fallbackSeries?.year;
            const seriesImdb = seriesInfo.info.imdb_id || seriesInfo.series_data?.imdb_id;
            fetchTmdbDetails(seriesName, seriesYear, 'series', seriesImdb).then(tmdb => {
              if (tmdb) {
                setData((current: any) => {
                  if (!current || !current.info) return current;
                  const updatedInfo = {
                    ...current.info,
                    plot: current.info.plot?.trim() ? current.info.plot : (tmdb.plot || ''),
                    cast: current.info.cast?.trim() ? current.info.cast : (tmdb.cast || ''),
                    director: current.info.director?.trim() ? current.info.director : (tmdb.director || ''),
                    genre: current.info.genre?.trim() ? current.info.genre : (tmdb.genre || ''),
                    releaseDate: current.info.releaseDate?.trim() ? current.info.releaseDate : (tmdb.releaseDate || '')
                  };
                  const enriched = { ...current, info: updatedInfo };
                  dataStorage.setItem(`cached_series_${cleanId}`, enriched).catch(() => {});
                  return enriched;
                });
              }
            });
          }
        } else {
          console.warn("[SERIES] Réponse IPTV incomplète pour ID:", cleanId, seriesInfo);
          if (fallbackSeries && fallbackSeries.name) {
            const fallbackData = {
              info: {
                name: fallbackSeries.name,
                cover: fallbackSeries.cover,
                rating: fallbackSeries.rating,
                releaseDate: fallbackSeries.year,
                genre: '',
                plot: ''
              },
              episodes: {},
              seasons: []
            };
            setData(fallbackData);
            setLoading(false);
            fetchTmdbDetails(fallbackSeries.name, fallbackSeries.year, 'series').then(tmdb => {
              if (tmdb) {
                setData((current: any) => {
                  if (!current || !current.info) return current;
                  const updatedInfo = {
                    ...current.info,
                    plot: tmdb.plot || '',
                    cast: tmdb.cast || '',
                    director: tmdb.director || '',
                    genre: tmdb.genre || '',
                    releaseDate: tmdb.releaseDate || current.info.releaseDate || ''
                  };
                  const enriched = { ...current, info: updatedInfo };
                  dataStorage.setItem(`cached_series_${cleanId}`, enriched).catch(() => {});
                  return enriched;
                });
              }
            });
          } else {
            throw new Error("Fiche introuvable ou métadonnées manquantes pour cette série.");
          }
        }
      } catch (err: any) {
        if (isTimedOut) return;
        clearTimeout(timeoutId);
        console.error("Erreur de récupération des détails de la série", err);
        if (fallbackSeries && fallbackSeries.name) {
          const fallbackData = {
            info: {
              name: fallbackSeries.name,
              cover: fallbackSeries.cover,
              rating: fallbackSeries.rating,
              releaseDate: fallbackSeries.year,
              genre: '',
              plot: ''
            },
            episodes: {},
            seasons: []
          };
          setData(fallbackData);
          setLoading(false);
          fetchTmdbDetails(fallbackSeries.name, fallbackSeries.year, 'series').then(tmdb => {
            if (tmdb) {
              setData((current: any) => {
                if (!current || !current.info) return current;
                const updatedInfo = {
                  ...current.info,
                  plot: tmdb.plot || '',
                  cast: tmdb.cast || '',
                  director: tmdb.director || '',
                  genre: tmdb.genre || '',
                  releaseDate: tmdb.releaseDate || current.info.releaseDate || ''
                };
                const enriched = { ...current, info: updatedInfo };
                dataStorage.setItem(`cached_series_${cleanId}`, enriched).catch(() => {});
                return enriched;
              });
            }
          });
        } else {
          setLoadError(err.message || "Impossible de charger les détails de la série auprès du serveur.");
          setLoading(false);
        }
      }
    };
    fetchData();
  }, [cleanId, localLibrary, fallbackSeries]);

  useEffect(() => {
    if (data && data.info) {
      const title = data.info.name;
      const year = data.info.releaseDate || data.series_data?.year;

      const imdbId = data.info.imdb_id || data.series_data?.imdb_id;

      // Lancer les 3 fetches de notes en parallele (chacune a son propre cache)
      fetchOmdbRating(title, year, 'series', imdbId)
        .then(r => { if (r) setOmdbRating(r); });

      fetchLetterboxdRating(title, year, imdbId)
        .then(r => { if (r) setLetterboxdRating(r); });

      fetchRegelegorillaRating(title, year, imdbId)
        .then(r => { if (r) setRegelegorillaRating(r); });
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

  if (loading && !hasValidData) {
    return (
      <div className="flex-1 flex bg-[#050505] text-white min-h-screen font-['Inter']">
        <Sidebar />
        <FocusContext.Provider value="SERIES_LOADING_ROOT">
          <div className="ml-20 lg:ml-72 3xl:ml-96 flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-transparent border-t-[#b5924d] border-r-[#b5924d]/40 animate-spin" />
              <div className="w-12 h-12 rounded-2xl bg-[#b5924d]/10 border border-[#b5924d]/30 flex items-center justify-center shadow-[0_0_30px_rgba(181,146,77,0.2)]">
                <span className="text-xl font-serif italic text-[#b5924d]">P</span>
              </div>
            </div>

            <h3 className="text-[11px] font-bold uppercase tracking-[0.6em] text-[#b5924d] mb-3 animate-pulse">
              Accès au Registre...
            </h3>
            <p className="text-[9px] uppercase tracking-[0.3em] text-white/30 max-w-sm leading-relaxed mb-10">
              Connexion au serveur IPTV et indexation des saisons
            </p>

            <FocusableActionBtn focusKey="SERIES_LOADING_CANCEL" onClick={() => router.back()}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Annuler et quitter (Retour)</span>
            </FocusableActionBtn>

            <p className="mt-8 text-[8px] uppercase tracking-widest text-white/20">
              Appuyez sur Retour / Échap à tout moment pour partir
            </p>
          </div>
        </FocusContext.Provider>
      </div>
    );
  }

  if ((loadError && !hasValidData) || (!loading && !hasValidData)) {
    return (
      <div className="flex-1 flex bg-[#050505] text-white min-h-screen font-['Inter']">
        <Sidebar />
        <FocusContext.Provider value="SERIES_ERROR_ROOT">
          <div className="ml-20 lg:ml-72 3xl:ml-96 flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-8 shadow-[0_0_40px_rgba(239,68,68,0.2)]">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-[13px] font-bold uppercase tracking-[0.5em] text-white mb-3">
              Défaut d'accès au Registre Série
            </h3>
            <p className="text-[10px] text-gray-400 font-light max-w-md leading-relaxed mb-10">
              {loadError || "Impossible de récupérer les saisons et épisodes de cette série."}
            </p>

            <div className="flex items-center space-x-4">
              <FocusableActionBtn focusKey="SERIES_ERROR_BACK" onClick={() => router.back()} primary={true}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Revenir à la liste</span>
              </FocusableActionBtn>
              
              <FocusableActionBtn 
                focusKey="SERIES_ERROR_RETRY" 
                onClick={() => {
                  setLoadError(null);
                  setLoading(true);
                  xtreamApi.getSeriesInfo(Number(cleanId))
                    .then(seriesInfo => {
                      if (!seriesInfo || !isValidSeriesInfo(seriesInfo.info)) throw new Error("Fiche introuvable");
                      setData(seriesInfo);
                      dataStorage.setItem(`cached_series_${cleanId}`, seriesInfo).catch(() => {});
                      setLoadError(null);
                    })
                    .catch(e => setLoadError(e.message || "Erreur de connexion"))
                    .finally(() => setLoading(false));
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Réessayer</span>
              </FocusableActionBtn>
            </div>
          </div>
        </FocusContext.Provider>
      </div>
    );
  }

  const displayTitle = data?.info?.name || fallbackSeries?.name || "Série";
  const displayCover = data?.info?.cover || data?.info?.movie_image || fallbackSeries?.cover || "";
  const episodes = selectedSeason && data?.episodes ? (data.episodes[selectedSeason] || []) : [];

  const parseCast = (castStr?: string) => {
    if (!castStr || typeof castStr !== 'string') return [];
    return castStr.split(',').map(s => s.trim()).filter(Boolean);
  };

  const actors = data?.info ? parseCast(data.info.cast) : [];
  const directors = data?.info ? parseCast(data.info.director) : [];

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

    const totalEpisodesCount = data?.episodes ? Object.values(data.episodes).reduce((acc: number, season: any) => acc + (season?.length || 0), 0) : 0;

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
        seriesId: cleanId,
        seriesTitle: displayTitle,
        seriesCover: displayCover,
        cover: displayCover
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
      router.push(`/player/${ep.id}?type=series&extension=${ep.container_extension}&title=${encodeURIComponent(ep.title)}&seriesId=${cleanId}&seriesTitle=${encodeURIComponent(displayTitle)}&seriesCover=${encodeURIComponent(displayCover)}&start=${startTime}`);
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
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lancement de l'épisode</span>
                </div>
            </div>
        )}
        <div className="absolute top-12 left-12 z-50 animate-in fade-in slide-in-from-left-10 duration-1000">
          <FocusableBackButton onClick={() => router.back()} />
        </div>

        <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-0 left-0 w-full h-[60vh] opacity-20 filter blur-[100px]">
                {displayCover && <img src={displayCover} className="w-full h-full object-cover" alt="" />}
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
                        <img 
                          src={displayCover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"} 
                          className="w-full h-full object-cover" 
                          alt="" 
                          onError={(e) => {
                            const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
                            if (e.currentTarget.src !== fallback) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                        />
                    </div>
                    <div className="flex justify-center w-full animate-in zoom-in-95 duration-1000">
                        <FavoriteDetailsButton item={{ ...(data?.info || {}), stream_id: cleanId, name: displayTitle, cover: displayCover, type: 'series' }} />
                    </div>
                </div>
                
                <div className="flex-1 max-w-4xl animate-in fade-in slide-in-from-right-10 duration-1000">
                    <h1 className="text-8xl font-extralight tracking-tight mb-8 leading-tight">
                        {displayTitle.split(' ').map((word: string, i: number) => (
                            <span key={i} className={i % 2 === 0 ? '' : 'opacity-30 italic font-serif'}>{word} </span>
                        ))}
                    </h1>
                    
                    <div className="flex flex-wrap items-center gap-4 mb-12">
                        {omdbRating ? (
                            <div className="flex items-center space-x-2 bg-[#f5c518]/20 px-3 py-1 rounded-sm border border-[#f5c518]/30">
                                <span className="bg-[#f5c518] text-black px-1 py-0.5 rounded-[2px] font-black tracking-normal text-[8px] shadow-sm">IMDb</span>
                                <span className="text-[#f5c518] font-bold text-sm">{omdbRating}</span>
                            </div>
                        ) : data?.info?.rating ? (
                            <div className="flex items-center space-x-2 bg-[#b5924d]/20 px-3 py-1 rounded-sm border border-[#b5924d]/30">
                                <span className="text-[#b5924d]">★</span>
                                <span className="text-[#b5924d] font-bold text-sm">{data.info.rating}</span>
                            </div>
                        ) : null}

                        {/* Badge Letterboxd */}
                        {letterboxdRating && (
                            <div className="flex items-center space-x-2 bg-[#00c030]/15 px-3 py-1 rounded-sm border border-[#00c030]/30">
                                <span className="bg-[#00c030] text-white px-1 py-0.5 rounded-[2px] font-black tracking-normal text-[8px] shadow-sm">LBD</span>
                                <span className="text-[#00c030] font-bold text-sm">{letterboxdRating}</span>
                            </div>
                        )}

                        {/* Badge Regelegorilla — note perso de l'utilisateur letterboxd.com/regelegorila */}
                        {regelegorillaRating && (
                            <div className="flex items-center space-x-2 bg-[#ff6b35]/15 px-3 py-1 rounded-sm border border-[#ff6b35]/30">
                                <span className="bg-[#ff6b35] text-black px-1 py-0.5 rounded-[2px] font-black tracking-normal text-[8px] shadow-sm">RG</span>
                                <span className="text-[#ff6b35] font-bold text-sm">{regelegorillaRating}</span>
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
        const parent = ref.current?.parentElement;
        const isFirst = !parent || parent.firstElementChild === ref.current;
        if (isFirst || (ref.current && ref.current.getBoundingClientRect().left <= 500)) {
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
        const grid = ref.current?.closest('.grid');
        if (grid && ref.current) {
          const gridLeft = grid.getBoundingClientRect().left;
          const cardLeft = ref.current.getBoundingClientRect().left;
          if (cardLeft - gridLeft < 60) {
            setFocus('NAV_SERIES');
            return false;
          }
        } else if (ref.current && ref.current.getBoundingClientRect().left <= 500) {
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
                   ${focused ? (isFavorited ? 'bg-netflix-red text-white border-netflix-red scale-110 shadow-[0_0_20px_rgba(229,9,20,0.4)]' : 'bg-white text-black border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)]') : (isFavorited ? 'border-netflix-red/40 text-netflix-red bg-netflix-red/10 hover:bg-netflix-red/20' : 'border-white/20 text-white hover:bg-white/10')}`}
        title={isFavorited ? "Gérer les favoris / Noter" : "Ajouter aux favoris"}
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
        setFocus('NAV_SERIES');
        return false;
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
        const parent = ref.current?.parentElement;
        const isFirst = !parent || parent.firstElementChild === ref.current;
        if (isFirst || (ref.current && ref.current.getBoundingClientRect().left <= 500)) {
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

function FocusableActionBtn({ focusKey, onClick, children, primary = false, className = '' }: any) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: onClick
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`px-8 py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.3em] transition-all duration-300 flex items-center justify-center space-x-3
        ${focused 
          ? (primary ? 'bg-[#b5924d] text-black scale-105 shadow-[0_0_30px_rgba(181,146,77,0.5)] border-[#b5924d]' : 'bg-white text-black scale-105 shadow-[0_0_30px_rgba(255,255,255,0.4)] border-white') 
          : (primary ? 'bg-[#b5924d]/20 text-[#b5924d] border border-[#b5924d]/30 hover:bg-[#b5924d]/30' : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white')
        } ${className}`}
    >
      {children}
    </button>
  );
}
