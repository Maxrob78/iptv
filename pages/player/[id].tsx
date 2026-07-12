import React, { useRef, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { xtreamApi } from '../../utils/xtream';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useProfileStore } from '../../store/useProfileStore';
import RatingModal from '../../components/RatingModal';

const VideoPlayer = dynamic(() => import('../../components/VideoPlayer'), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-black text-white text-2xl font-black animate-pulse uppercase">Chargement du Studio...</div>
});

export default function StreamPlayer() {
  const router = useRouter();
  const { id, type, extension, nextId, nextTitle, title, localPath, seriesId, seriesTitle, seriesCover, cover } = router.query;

  const [ext, setExt] = useState('mkv');
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [userActive, setUserActive] = useState(true);
  const [showAutoplay, setShowAutoplay] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [isCopied, setIsCopied] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const activityTimer = useRef<any>(null);
  const progressInterval = useRef<any>(null);
  const countdownInterval = useRef<any>(null);

  const { ref, focusKey } = useFocusable({
    focusKey: 'PLAYER_ROOT'
  });

  const saveProgress = () => {
    if (type === 'live') return;
    if (!playerRef.current || playerRef.current.isDisposed()) return;
    const currentTime = playerRef.current.currentTime();
    const duration = playerRef.current.duration();
    if (!duration || duration <= 0) return;

    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    const progress = (currentTime / duration) * 100;
    
    history[id as string] = {
      id,
      currentTime,
      duration,
      progress: Math.min(progress, 100),
      watched: progress > 90,
      lastUpdated: Date.now(),
      type: type || 'movie',
      title: title || 'Registre Inconnu',
      extension: ext,
      seriesId: seriesId || null,
      seriesTitle: seriesTitle || null,
      seriesCover: seriesCover || null,
      cover: cover || seriesCover || ''
    };
    localStorage.setItem(historyKey, JSON.stringify(history));
  };

  useEffect(() => {
    progressInterval.current = setInterval(saveProgress, 10000);
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      saveProgress();
    };
  }, [id]);

  useEffect(() => {
    const handleActivity = () => {
      setUserActive(true);
      if (activityTimer.current) clearTimeout(activityTimer.current);
      activityTimer.current = setTimeout(() => {
        setUserActive(false);
      }, 5000);
    };

    window.addEventListener('mousemove', handleActivity);
    handleActivity();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      if (activityTimer.current) clearTimeout(activityTimer.current);
    };
  }, []);

  // Gestion des touches TV (Remote Control)
  useEffect(() => {
    setFocus('PLAYER_ROOT');

    const handleKeyDown = (e: KeyboardEvent) => {
      setUserActive(true); // Réveiller l'interface sur n'importe quelle touche
      
      if (!playerRef.current) return;

      switch(e.key) {
        case 'Enter':
        case ' ':
          togglePlay();
          break;
        case 'ArrowRight':
          playerRef.current.currentTime(playerRef.current.currentTime() + 10);
          break;
        case 'ArrowLeft':
          playerRef.current.currentTime(playerRef.current.currentTime() - 10);
          break;
        case 'ArrowUp':
          setShowOptions(true);
          break;
        case 'ArrowDown':
          setShowOptions(false);
          break;
        case 'Escape':
        case 'Backspace':
          // Sur Tizen, 'Backspace' est souvent le bouton Retour
          if (showRating) setShowRating(false);
          else if (showOptions) setShowOptions(false);
          else router.back();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOptions, showRating, router]);

  useEffect(() => {
    if (extension) setExt(extension as string);
  }, [extension]);

  useEffect(() => {
    if (showAutoplay && countdown > 0) {
      countdownInterval.current = setInterval(() => setCountdown(prev => prev - 1), 1000);
    } else if (showAutoplay && countdown === 0) {
      handleNext();
    }
    return () => { if (countdownInterval.current) clearInterval(countdownInterval.current); };
  }, [showAutoplay, countdown]);

  const streamType = (type as 'live' | 'movie' | 'series') || 'live';
  const streamUrl = useMemo(() => {
    if (localPath) return decodeURIComponent(localPath as string);
    return id ? xtreamApi.getStreamUrl(Number(id), streamType, ext) : '';
  }, [id, streamType, ext, localPath]);

  const sourceType = useMemo(() => {
    if (localPath) return 'video/mp4';
    return ext === 'm3u8' ? 'application/x-mpegURL' : 'video/mp4';
  }, [ext, localPath]);

  const videoJsOptions = useMemo(() => ({
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    preload: 'auto',
    html5: {
      vhs: { overrideNative: true },
      nativeAudioTracks: true,
      nativeVideoTracks: true
    },
    sources: [{ src: streamUrl, type: sourceType }]
  }), [streamUrl, sourceType]);

  if (!id) return null;

  const saveExternalProgress = () => {
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    history[id as string] = {
      id,
      currentTime: 0,
      duration: 100,
      progress: 95,
      watched: true,
      lastUpdated: Date.now(),
      type: type || 'movie',
      title: title || 'Registre Inconnu',
      extension: ext,
      seriesId: seriesId || null,
      seriesTitle: seriesTitle || null,
      seriesCover: seriesCover || null,
      cover: cover || seriesCover || ''
    };
    localStorage.setItem(historyKey, JSON.stringify(history));
  };

  const handleNext = () => {
    if (nextId) router.push(`/player/${nextId}?type=series&extension=${ext}&title=${nextTitle || ''}`);
  };

  const handlePlayerReady = (player: any) => {
    playerRef.current = player;
    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    const savedData = history[id as string];
    
    const startParam = router.query.start !== undefined ? Number(router.query.start) : null;

    if (startParam !== null) {
        if (startParam > 0) player.currentTime(startParam);
    } else if (savedData && savedData.currentTime > 5 && !savedData.watched) {
        player.currentTime(savedData.currentTime);
    }

    player.on('play', () => { setIsPlaying(true); setPlayerError(false); });
    player.on('pause', () => setIsPlaying(false));
    player.on('error', () => {
      const error = player.error();
      if (error && (error.code === 3 || error.code === 4)) {
        setPlayerError(true);
      }
    });
  };

  const toggleFullscreen = () => {
    if (playerRef.current) {
      if (playerRef.current.isFullscreen()) playerRef.current.exitFullscreen();
      else playerRef.current.requestFullscreen();
    }
  };

  const togglePlay = () => {
    if (playerRef.current) {
      if (playerRef.current.paused()) playerRef.current.play();
      else playerRef.current.pause();
    }
  };

  return (
    <FocusContext.Provider value={focusKey}>
    <div ref={ref} className="h-screen w-screen bg-black overflow-hidden relative select-none group font-['Inter']">
      <style jsx global>{`
        .video-js { width: 100vw !important; height: 100vh !important; font-family: 'Inter', sans-serif !important; }
        
        .vjs-control-bar { 
            background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 50%, transparent 100%) !important; 
            height: 90px !important; 
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            z-index: 100 !important;
            opacity: ${userActive ? '1' : '0'} !important;
            transition: opacity 0.8s ease-in-out !important;
            padding: 0 40px !important;
        }

        /* FORCE 100% WIDTH PROGRESS BAR (PANORAMIC MODE) */
        .vjs-progress-control { 
            position: fixed !important;
            bottom: 5px !important; /* On la descend tout en bas */
            left: 0 !important;
            right: 0 !important;
            width: 100vw !important; 
            min-width: 100vw !important;
            height: 6px !important;
            z-index: 200 !important;
            opacity: ${userActive ? '1' : '0'} !important;
            transition: all 0.5s ease-in-out !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
        }

        .vjs-progress-holder { 
            background: rgba(255,255,255,0.05) !important; 
            height: 100% !important; 
            margin: 0 !important; 
            width: 100% !important;
            border-radius: 0 !important;
        }

        .vjs-play-progress { 
            background: #b5924d !important; 
            box-shadow: 0 0 30px rgba(181, 146, 77, 0.6) !important;
        }
        
        .vjs-play-progress:before { 
            display: none !important; 
        }

        .vjs-control { width: 60px !important; color: white !important; }
        .vjs-button > .vjs-icon-placeholder:before { font-size: 2.2em !important; line-height: 90px !important; }
        .vjs-time-control { display: block !important; line-height: 90px !important; font-weight: 300 !important; font-size: 0.9em !important; opacity: 0.6; }
        
        /* HIDDEN ELEMENTS */
        .vjs-volume-panel, 
        .vjs-volume-control, 
        .vjs-volume-bar, 
        .vjs-volume-level, 
        .vjs-control-text, 
        .vjs-big-play-button,
        .vjs-mouse-display,
        .vjs-load-progress { display: none !important; }
      `}</style>

      <div onDoubleClick={toggleFullscreen} className="absolute inset-0 z-40 pointer-events-none">
        <div className={`absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 transition-opacity duration-1000 ${userActive ? 'opacity-100' : 'opacity-0'}`} />

        {/* Back Button */}
        <div className={`absolute top-12 left-12 transition-all duration-700 pointer-events-auto ${userActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <FocusablePlayerButton onClick={() => router.back()}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7"/></svg>
                <span className="text-[10px] font-medium uppercase tracking-[0.6em] opacity-40 group-hover:opacity-100 transition-opacity ml-4">Retour</span>
          </FocusablePlayerButton>
        </div>

        {/* Platinum Options Button */}
        <div className={`absolute top-12 right-12 transition-all duration-700 pointer-events-auto ${userActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <FocusablePlayerButton 
            onClick={() => setShowOptions(!showOptions)} 
            active={showOptions}
          >
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span className="text-[10px] font-bold uppercase tracking-[0.4em]">Options</span>
          </FocusablePlayerButton>
        </div>

        {/* EMERGENCY ERROR OVERLAY */}
        {playerError && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center px-12 pointer-events-auto">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl animate-in fade-in duration-700" />
            
            <div className="max-w-xl w-full bg-[#080808] border border-[#b5924d]/30 p-16 rounded-3xl shadow-[0_60px_120px_rgba(0,0,0,1)] relative animate-in zoom-in-95 duration-700 text-center">
               <div className="w-20 h-20 bg-[#b5924d]/10 rounded-full flex items-center justify-center mx-auto mb-10 border border-[#b5924d]/20">
                  <svg className="w-8 h-8 text-[#b5924d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
               </div>
               
               <h2 className="text-4xl font-extralight tracking-tight text-white mb-6">Défaut de Registre <span className="opacity-40 italic font-serif">(Codecs)</span></h2>
               <p className="text-gray-500 font-light leading-relaxed mb-12">
                  Le format vidéo de ce flux est incompatible avec le moteur de rendu intégré (HEVC/4K). <br /> <br />
                  Pour une expérience sans interruption, utilisez le moteur de décodage externe.
               </p>

               <div className="space-y-4">
                  <button 
                    onClick={() => {
                        setPlayerError(false);
                        saveExternalProgress();
                        // @ts-ignore
                        window.electronAPI?.openVLC(streamUrl);
                    }}
                    className="w-full bg-[#b5924d] text-black font-bold py-6 rounded-xl hover:scale-[1.02] active:scale-95 transition-all uppercase text-[11px] tracking-[0.4em]"
                  >
                    Regarder avec VLC (Recommandé)
                  </button>
                  <button 
                    onClick={() => {
                        setPlayerError(false);
                        router.back(); // Solution de secours ultime : on quitte la page bloquée
                    }}
                    className="w-full border border-white/5 text-gray-500 hover:text-white py-4 rounded-xl transition-all uppercase text-[9px] tracking-widest"
                  >
                    Quitter et revenir en arrière
                  </button>
               </div>

               <p className="mt-12 text-[8px] font-bold uppercase tracking-[0.6em] text-gray-800">Platinum Diagnostic Suite v2.0</p>
            </div>
          </div>
        )}

        {/* Center Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={togglePlay}
            className={`w-32 h-32 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-center transition-all duration-1000 pointer-events-auto hover:bg-white/10 hover:scale-110 ${!isPlaying ? 'opacity-100 scale-100' : 'opacity-0 scale-150 pointer-events-none'}`}
          >
            <svg className="w-12 h-12 text-white translate-x-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>

        {/* Title Group */}
        <div className={`absolute bottom-32 left-16 transition-all duration-1000 ${userActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-8 h-[1px] bg-[#b5924d]" />
            <p className="text-[#b5924d] font-bold uppercase text-[9px] tracking-[0.6em]">Visionnage Privé</p>
          </div>
          <h1 className="text-6xl font-extralight text-white tracking-tighter max-w-4xl leading-[1.1] drop-shadow-2xl">{title || "Sans Titre"}</h1>
        </div>

        {/* REWORKED PLATINUM MENU */}
        {showOptions && (
          <div className="absolute top-32 right-12 w-[380px] bg-[#080808]/90 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_50px_100px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-500 pointer-events-auto">
            <div className="flex items-center space-x-4 mb-8 border-b border-white/5 pb-6">
                <span className="text-[10px] font-bold text-[#b5924d] uppercase tracking-[0.5em]">Commandes Système</span>
            </div>
            
            <div className="space-y-3">
              <button onClick={() => { 
                if (playerRef.current) {
                  const freshUrl = streamUrl + (streamUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
                  playerRef.current.src(freshUrl);
                  playerRef.current.load();
                  playerRef.current.play();
                  setShowOptions(false);
                }
              }} className="w-full group flex items-center justify-between p-5 bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 rounded-xl transition-all">
                <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-gray-300 group-hover:text-white transition-colors">Rafraîchir le flux</span>
                <svg className="w-5 h-5 text-[#b5924d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>

              <button onClick={() => {
                if (playerRef.current?.audioTracks) {
                  const tracks = playerRef.current.audioTracks();
                  if (tracks && tracks.length > 1) {
                    let idx = 0;
                    for (let i = 0; i < tracks.length; i++) if (tracks[i].enabled) { idx = (i + 1) % tracks.length; break; }
                    for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === idx;
                  }
                }
              }} className="w-full group flex items-center justify-between p-5 bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 rounded-xl transition-all">
                <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-gray-300 group-hover:text-white transition-colors">Changer d'audio</span>
                <svg className="w-5 h-5 text-[#b5924d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
              </button>

              <button onClick={() => {
                setShowOptions(false);
                setShowRating(true);
              }} className="w-full group flex items-center justify-between p-5 bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 rounded-xl transition-all">
                <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-gray-300 group-hover:text-white transition-colors">Noter l'œuvre</span>
                <svg className="w-5 h-5 text-[#b5924d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
              </button>

              <div className="py-4" />

              <button onClick={() => {
                setShowOptions(false);
                saveExternalProgress();
                try { playerRef.current?.pause(); } catch(e) {}
                // @ts-ignore
                window.electronAPI?.openVLC(streamUrl);
              }} className="w-full group flex items-center justify-between p-5 bg-[#b5924d]/10 hover:bg-[#b5924d]/20 border border-[#b5924d]/20 rounded-xl transition-all">
                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#b5924d]">Ouvrir avec VLC</span>
                <div className="w-6 h-6 bg-[#b5924d] rounded-full flex items-center justify-center p-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    <svg fill="black" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.8 20.3l-2.4-1.2-1.1-6.9 1.1-1.1 1.7 1.7-.8 1.4 1.2.6.8-1.4 2.8 2.8-1.2 2.5-2.1-1.4zm-13.6 0l2.4-1.2 1.1-6.9-1.1-1.1-1.7 1.7.8 1.4-1.2.6-.8-1.4-2.8 2.8 1.2 2.5 2.1-1.4zM12 2c-.6 0-1.2.5-1.2 1.2v.1l-1.9 8.2h6.2l-1.9-8.2V3.2c0-.7-.6-1.2-1.2-1.2z"/></svg>
                </div>
              </button>

              <button onClick={() => {
                setShowOptions(false);
                saveExternalProgress();
                try { playerRef.current?.pause(); } catch(e) {}
                // @ts-ignore
                window.electronAPI?.openMPV({
                    streamUrl,
                    streamId: id,
                    title: title,
                    type: type
                });
              }} className="w-full group flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white">Lecteur Platinum Turbo (MPV)</span>
                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center p-1.5 opacity-80 group-hover:opacity-100 transition-opacity text-black">
                    <svg fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
              </button>

              <button onClick={() => {
                // @ts-ignore
                window.electronAPI?.send?.('copy-to-clipboard', streamUrl);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }} className={`w-full flex items-center justify-between p-5 border rounded-xl transition-all ${isCopied ? 'bg-white border-white text-black' : 'bg-transparent border-white/10 text-white hover:bg-white/5'}`}>
                <span className="text-[11px] font-bold uppercase tracking-[0.3em]">{isCopied ? 'Lien copié' : 'Copier le lien'}</span>
                {!isCopied && <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>}
              </button>
            </div>
            
            <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-center space-x-3 opacity-20">
                <span className="text-[7px] font-bold uppercase tracking-[0.8em]">Platinum Signature Series — Ver 2.5</span>
            </div>
          </div>
        )}

        {/* Autoplay Preview */}
        {showAutoplay && nextId && (
          <div className="absolute bottom-32 right-12 z-50 animate-in slide-in-from-right-20 duration-1000 pointer-events-auto">
            <div className="bg-[#080808]/90 backdrop-blur-3xl border border-white/10 p-12 rounded-2xl w-[450px] shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 bg-[#b5924d] transition-all duration-1000" style={{ width: `${(countdown / 10) * 100}%` }} />
              <p className="text-[#b5924d] font-bold uppercase text-[9px] tracking-[0.5em] mb-4">À suivre dans {countdown}s</p>
              <h2 className="text-4xl font-extralight text-white mb-10 leading-tight tracking-tight">{nextTitle || "Épisode Suivant"}</h2>
              <div className="flex space-x-4">
                <button onClick={handleNext} className="flex-1 bg-white text-black font-bold py-5 rounded-lg hover:bg-white/90 transition-all uppercase text-[10px] tracking-widest">Lire maintenant</button>
                <button onClick={() => setShowAutoplay(false)} className="bg-white/5 hover:bg-white/10 text-white px-8 rounded-lg font-bold uppercase text-[10px] tracking-widest">Ignorer</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <VideoPlayer options={videoJsOptions} onReady={handlePlayerReady} />

      {showRating && (
        <RatingModal 
          item={{ id, name: title || seriesTitle, stream_id: id }} 
          onClose={() => {
            setShowRating(false);
            setFocus('PLAYER_ROOT');
          }} 
        />
      )}
    </div>
    </FocusContext.Provider>
  );
}

function FocusablePlayerButton({ children, onClick, active }: any) {
  const { ref, focused } = useFocusable({
    onEnterPress: onClick
  });

  return (
    <button 
      ref={ref}
      onClick={onClick}
      className={`flex items-center px-8 py-4 rounded-full border backdrop-blur-xl transition-all duration-300
                 ${focused || active ? 'bg-[#b5924d] text-black border-[#b5924d] scale-110 shadow-[0_0_40px_rgba(181,146,77,0.5)]' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}
