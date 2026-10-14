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

export default function MovieDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackHistory, setPlaybackHistory] = useState<any>({});
  const [showRating, setShowRating] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string | null>(null);
  const [omdbRating, setOmdbRating] = useState<string | null>(null);
  const [letterboxdRating, setLetterboxdRating] = useState<string | null>(null);
  const [regelegorillaRating, setRegelegorillaRating] = useState<string | null>(null);

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
    trackChildren: true,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_MOVIES');
        return false;
      }
      return true;
    }
  });

  const cleanId = id ? (Array.isArray(id) ? String(id[0]) : String(id)) : '';

  const userRating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[cleanId]?.rating;
  });

  const fallbackMovie = React.useMemo(() => {
    if (!cleanId || cleanId.startsWith('local-')) return null;
    const storeMovies = useDataStore.getState().movies || [];
    const storeFavorites = useDataStore.getState().getProfileData()?.favorites || [];
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    let historyItem: any = null;
    try {
      const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
      historyItem = history[cleanId];
    } catch { }

    const match = 
      storeMovies.find((m: any) => String(m.stream_id || m.id) === cleanId) ||
      storeFavorites.find((f: any) => String(f.stream_id || f.id) === cleanId);

    if (match) {
      return {
        stream_id: cleanId,
        name: match.name || match.title || historyItem?.title || '',
        cover: match.stream_icon || match.cover || historyItem?.cover || '',
        rating: match.rating || '',
        year: match.year || match.releaseDate || '',
        container_extension: match.container_extension || historyItem?.extension || 'mkv'
      };
    }

    if (historyItem) {
      return {
        stream_id: cleanId,
        name: historyItem.title || '',
        cover: historyItem.cover || '',
        rating: '',
        year: '',
        container_extension: historyItem.extension || 'mkv'
      };
    }
    return null;
  }, [cleanId]);

  const isValidMovieInfo = (info: any) => {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return false;
    return Boolean(info.name || info.title || info.movie_image || info.cover);
  };

  const hasValidData = Boolean(data && isValidMovieInfo(data.info));

  const focusSet = useRef(false);
  useEffect(() => {
    if (!loading && hasValidData && !focusSet.current) {
      setTimeout(() => {
        setFocus('MOVIE_BACK_BTN');
        focusSet.current = true;
      }, 300);
    } else if (loading && !hasValidData) {
      setTimeout(() => {
        setFocus('MOVIE_LOADING_CANCEL');
      }, 100);
    } else if (loadError && !hasValidData) {
      setTimeout(() => {
        setFocus('MOVIE_ERROR_BACK');
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

    // Réinitialiser les états immédiatement pour éviter d'afficher les données résiduelles d'un autre film
    setData(null);
    setLoading(true);
    setLoadError(null);
    setOmdbRating(null);
    setLetterboxdRating(null);
    setRegelegorillaRating(null);

    if (cleanId.startsWith('local-')) {
      const realId = cleanId.replace('local-', '');
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
      setLoadError(null);

      // 1. Tenter de charger immédiatement depuis le cache IndexedDB
      let currentCached: any = null;
      try {
        const cached = await dataStorage.getItem<any>(`cached_vod_${cleanId}`);
        currentCached = cached;
        const hasFullInfo = cached && isValidMovieInfo(cached.info) && Boolean((cached.info.plot && cached.info.plot.trim()) || (cached.info.cast && cached.info.cast.trim()));
        if (hasFullInfo) {
          setData(cached);
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
          if (!current || !isValidMovieInfo(current.info)) {
            setLoadError("Le serveur IPTV met trop de temps à répondre (Délai d'attente dépassé).");
          }
          return current;
        });
        setLoading(false);
      }, 12000);

      try {
        const vodInfo = await xtreamApi.getVodInfo(Number(cleanId));
        if (isTimedOut) return;
        clearTimeout(timeoutId);

        if (vodInfo && isValidMovieInfo(vodInfo.info)) {
          // Fusion intelligente : Ne JAMAIS écraser un synopsis, casting ou réalisateur déjà en cache par du vide
          const existingInfo = currentCached?.info || {};
          const existingPlot = (existingInfo.plot && existingInfo.plot.trim()) || '';
          const existingCast = (existingInfo.cast && existingInfo.cast.trim()) || '';
          const existingDirector = (existingInfo.director && existingInfo.director.trim()) || '';
          const existingGenre = (existingInfo.genre && existingInfo.genre.trim()) || '';
          const existingReleaseDate = (existingInfo.releaseDate && existingInfo.releaseDate.trim()) || '';

          const vodPlot = (vodInfo.info.plot && vodInfo.info.plot.trim()) || '';
          const vodCast = (vodInfo.info.cast && vodInfo.info.cast.trim()) || '';
          const vodDirector = (vodInfo.info.director && vodInfo.info.director.trim()) || '';
          const vodGenre = (vodInfo.info.genre && vodInfo.info.genre.trim()) || '';
          const vodReleaseDate = (vodInfo.info.releaseDate && vodInfo.info.releaseDate.trim()) || '';

          const mergedInfo = {
            ...vodInfo.info,
            name: vodInfo.info.name || existingInfo.name || fallbackMovie?.name,
            plot: vodPlot || existingPlot,
            cast: vodCast || existingCast,
            director: vodDirector || existingDirector,
            genre: vodGenre || existingGenre,
            releaseDate: vodReleaseDate || existingReleaseDate || fallbackMovie?.year || '',
            cover: vodInfo.info.cover || vodInfo.info.movie_image || existingInfo.cover || existingInfo.movie_image || fallbackMovie?.cover,
            movie_image: vodInfo.info.movie_image || vodInfo.info.cover || existingInfo.movie_image || existingInfo.cover || fallbackMovie?.cover,
          };

          const mergedVod = {
            ...vodInfo,
            info: mergedInfo,
            movie_data: {
              ...(vodInfo.movie_data || {}),
              stream_id: cleanId,
              name: mergedInfo.name || fallbackMovie?.name,
              container_extension: vodInfo.movie_data?.container_extension || fallbackMovie?.container_extension || 'mkv',
              stream_icon: mergedInfo.cover || fallbackMovie?.cover
            }
          };

          setData(mergedVod);
          setLoading(false);
          setLoadError(null);
          dataStorage.setItem(`cached_vod_${cleanId}`, mergedVod).catch(() => {});

          const cover = mergedInfo.cover || mergedInfo.movie_image;
          if (cover) {
            useDataStore.getState().updateItemCover(cleanId, cover);
          }

          // EN TEMPS RÉEL : Si synopsis ou casting encore manquant, enrichir via TMDB
          const hasPlot = Boolean(mergedInfo.plot && mergedInfo.plot.trim());
          const hasCast = Boolean(mergedInfo.cast && mergedInfo.cast.trim());
          if (!hasPlot || !hasCast) {
            const filmName = mergedInfo.name || fallbackMovie?.name;
            const filmYear = mergedInfo.releaseDate || fallbackMovie?.year;
            const filmImdb = mergedInfo.imdb_id || vodInfo.movie_data?.imdb_id;
            fetchTmdbDetails(filmName, filmYear, 'movie', filmImdb).then(tmdb => {
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
                  dataStorage.setItem(`cached_vod_${cleanId}`, enriched).catch(() => {});
                  return enriched;
                });
              }
            });
          }
        } else {
          console.warn("[VOD] Réponse IPTV incomplète ou vide pour ID:", cleanId, vodInfo);
          if (fallbackMovie && fallbackMovie.name) {
            const existingInfo = currentCached?.info || {};
            const fallbackData = {
              info: {
                name: fallbackMovie.name,
                cover: fallbackMovie.cover,
                movie_image: fallbackMovie.cover,
                rating: fallbackMovie.rating,
                releaseDate: fallbackMovie.year || existingInfo.releaseDate || '',
                plot: existingInfo.plot || '',
                cast: existingInfo.cast || '',
                director: existingInfo.director || '',
                genre: existingInfo.genre || ''
              },
              movie_data: {
                stream_id: cleanId,
                name: fallbackMovie.name,
                container_extension: fallbackMovie.container_extension,
                stream_icon: fallbackMovie.cover
              }
            };
            setData(fallbackData);
            setLoading(false);
            fetchTmdbDetails(fallbackMovie.name, fallbackMovie.year, 'movie').then(tmdb => {
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
                  dataStorage.setItem(`cached_vod_${cleanId}`, enriched).catch(() => {});
                  return enriched;
                });
              }
            });
          } else {
            throw new Error("Fiche introuvable ou métadonnées manquantes pour cette œuvre.");
          }
        }
      } catch (err: any) {
        if (isTimedOut) return;
        clearTimeout(timeoutId);
        console.error("Erreur de récupération des détails du film", err);
        if (fallbackMovie && fallbackMovie.name) {
          const existingInfo = currentCached?.info || {};
          const fallbackData = {
            info: {
              name: fallbackMovie.name,
              cover: fallbackMovie.cover,
              movie_image: fallbackMovie.cover,
              rating: fallbackMovie.rating,
              releaseDate: fallbackMovie.year || existingInfo.releaseDate || '',
              plot: existingInfo.plot || '',
              cast: existingInfo.cast || '',
              director: existingInfo.director || '',
              genre: existingInfo.genre || ''
            },
            movie_data: {
              stream_id: cleanId,
              name: fallbackMovie.name,
              container_extension: fallbackMovie.container_extension,
              stream_icon: fallbackMovie.cover
            }
          };
          setData(fallbackData);
          setLoading(false);
          fetchTmdbDetails(fallbackMovie.name, fallbackMovie.year, 'movie').then(tmdb => {
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
                dataStorage.setItem(`cached_vod_${cleanId}`, enriched).catch(() => {});
                return enriched;
              });
            }
          });
        } else {
          setLoadError(err.message || "Impossible de charger les détails du film auprès du serveur.");
          setLoading(false);
        }
      }
    };
    fetchData();
  }, [cleanId, localLibrary, fallbackMovie]);

  useEffect(() => {
    if (data && data.info) {
      const title = data.info.name;
      const year = data.info.releaseDate || data.movie_data?.year;

      const imdbId = data.info.imdb_id || data.movie_data?.imdb_id;

      // Lancer les 3 fetches de notes en parallele (chacune a son propre cache)
      fetchOmdbRating(title, year, 'movie', imdbId)
        .then(r => { if (r) setOmdbRating(r); });

      fetchLetterboxdRating(title, year, imdbId)
        .then(r => { if (r) setLetterboxdRating(r); });

      fetchRegelegorillaRating(title, year, imdbId)
        .then(r => { if (r) setRegelegorillaRating(r); });
    }
  }, [data]);

  if (loading && !hasValidData) {
    return (
      <div className="flex-1 flex bg-[#050505] text-white min-h-screen font-['Inter']">
        <Sidebar />
        <FocusContext.Provider value="MOVIE_LOADING_ROOT">
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
              Connexion au serveur IPTV et indexation de la fiche
            </p>

            <FocusableActionBtn focusKey="MOVIE_LOADING_CANCEL" onClick={() => router.back()}>
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
        <FocusContext.Provider value="MOVIE_ERROR_ROOT">
          <div className="ml-20 lg:ml-72 3xl:ml-96 flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-8 shadow-[0_0_40px_rgba(239,68,68,0.2)]">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-[13px] font-bold uppercase tracking-[0.5em] text-white mb-3">
              Défaut d'accès au Registre
            </h3>
            <p className="text-[10px] text-gray-400 font-light max-w-md leading-relaxed mb-10">
              {loadError || "Impossible de récupérer les détails de ce film auprès du serveur IPTV."}
            </p>

            <div className="flex items-center space-x-4">
              <FocusableActionBtn focusKey="MOVIE_ERROR_BACK" onClick={() => router.back()} primary={true}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Revenir à la liste</span>
              </FocusableActionBtn>
              
              <FocusableActionBtn 
                focusKey="MOVIE_ERROR_RETRY" 
                onClick={() => {
                  setLoadError(null);
                  setLoading(true);
                  xtreamApi.getVodInfo(Number(cleanId))
                    .then(vodInfo => {
                      if (!vodInfo || !isValidMovieInfo(vodInfo.info)) throw new Error("Fiche introuvable");
                      setData(vodInfo);
                      dataStorage.setItem(`cached_vod_${cleanId}`, vodInfo).catch(() => {});
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

  const movieData = data?.movie_data || data?.info || fallbackMovie || {};
  const displayTitle = data?.info?.name || movieData?.name || fallbackMovie?.name || "Film";
  const displayCover = data?.info?.cover || data?.info?.movie_image || movieData?.stream_icon || fallbackMovie?.cover;

  const handlePlayMovie = (forcedStartTime?: number) => {
    if (launchingVideo) return; 
    
    const streamId = String(movieData.stream_id || cleanId);
    const streamUrl = xtreamApi.getStreamUrl(streamId, 'movie', movieData.container_extension || 'mkv');
    
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;

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

    setLaunchingVideo(displayTitle);
    
    if (!history[streamId]) {
      history[streamId] = {
        id: streamId,
        currentTime: 0,
        duration: 100,
        progress: 1,
        watched: false,
        lastUpdated: Date.now(),
        type: 'movie',
        title: displayTitle,
        extension: movieData.container_extension || 'mkv',
        cover: displayCover || ''
      };
      localStorage.setItem(historyKey, JSON.stringify(history));
    }

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
        streamUrl: streamUrl,
        title: displayTitle,
        startTime: startTime,
        streamId: streamId,
        type: 'movie'
      });
      setTimeout(() => setLaunchingVideo(null), 3000);
    } else {
      router.push(`/player/${streamId}?type=movie&extension=${movieData.container_extension || 'mkv'}&title=${encodeURIComponent(displayTitle)}&cover=${encodeURIComponent(displayCover || '')}&start=${startTime}`);
      setTimeout(() => setLaunchingVideo(null), 1000);
    }
  };

  const parseCast = (castStr?: string) => {
    if (!castStr || typeof castStr !== 'string') return [];
    return castStr.split(',').map(s => s.trim()).filter(Boolean);
  };

  const actors = parseCast(data?.info?.cast);
  const directors = parseCast(data?.info?.director);
  const historyData = playbackHistory[cleanId];

  const getDisplayDuration = () => {
    if (!data?.info) return null;
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
        <main id="main-scroll" ref={ref} className="ml-20 lg:ml-72 3xl:ml-96 flex-1 relative overflow-y-auto no-scrollbar pb-32">

          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Lancement : {launchingVideo}</span>
              </div>
            </div>
          )}

          <div className="fixed inset-0 z-0 w-full h-[70vh]">
            {displayCover && (
              <img 
                src={displayCover} 
                alt="Cover" 
                className="w-full h-full object-cover opacity-30"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/50 to-transparent" />
          </div>

          <div className="absolute top-12 left-12 z-50 animate-in fade-in slide-in-from-left-10 duration-1000">
            <FocusableBackButton onClick={() => router.back()} />
          </div>

          <div className="relative z-10 px-12 pt-32 max-w-[95%] animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="flex flex-col md:flex-row gap-16">
              <div className="w-72 flex-shrink-0">
                <div className="aspect-[3/4.5] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative">
                  <img 
                    src={displayCover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"} 
                    alt={displayTitle}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                  {historyData && historyData.watched && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                        <span className="text-white text-[10px] font-bold tracking-[0.4em] uppercase border border-white/20 px-4 py-2 rounded-full">Vu</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 pt-4">
                <div className="flex items-center space-x-4 mb-6">
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

                  {/* Badge Regelegorilla */}
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
                  {data?.info?.releaseDate && (
                    <span className="text-gray-400 text-sm font-medium">{data.info.releaseDate}</span>
                  )}
                  {getDisplayDuration() && (
                    <span className="text-gray-400 text-sm font-medium">{getDisplayDuration()}</span>
                  )}
                  {data?.info?.genre && (
                    <span className="text-gray-500 text-sm">{data.info.genre}</span>
                  )}
                </div>

                <h1 className="text-6xl font-extralight tracking-tight mb-8 leading-tight">
                  {displayTitle}
                </h1>

                <p className="text-gray-400 text-lg leading-relaxed max-w-3xl mb-12 font-light">
                  {data?.info?.plot || data?.info?.description || "Aucun synopsis disponible."}
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
                  
                  {data?.info?.youtube_trailer && (
                    <TrailerButton videoId={data.info.youtube_trailer} />
                  )}

                  <FavoriteDetailsButton item={{ 
                    ...(data?.movie_data || {}), 
                    ...(data?.info || {}), 
                    stream_id: cleanId, 
                    name: displayTitle,
                    cover: displayCover,
                    stream_icon: displayCover,
                    type: 'movie',
                    stream_type: 'movie'
                  }} />
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
                  item={{ 
                    ...(data.movie_data || {}), 
                    ...data.info, 
                    stream_id: id, 
                    name: data.info?.name || data.movie_data?.name,
                    cover: data.info?.cover || data.info?.movie_image || (data.movie_data && data.movie_data.stream_icon),
                    stream_icon: data.info?.cover || data.info?.movie_image || (data.movie_data && data.movie_data.stream_icon)
                  }}
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
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_MOVIES');
        return false;
      }
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

function FocusableBackButton({ onClick }: { onClick: () => void }) {
  const { ref, focused } = useFocusable({
    focusKey: 'MOVIE_BACK_BTN',
    onEnterPress: onClick,
    onFocus: () => setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50),
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_MOVIES');
        return false;
      }
      if (direction === 'right') return false;
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
