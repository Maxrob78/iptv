import React, { useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export const VideoPlayer = (props: any) => {
  const { options, onReady } = props;
  const artRef = useRef<HTMLDivElement>(null);
  const playerInstance = useRef<Artplayer | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerInstance.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    playerInstance.current.video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    if (!artRef.current) return;

    const source = options.sources?.[0];
    const url = source?.src || '';
    
    // DÉTECTION TIZEN / AVPLAY
    const isTizen = typeof window !== 'undefined' && ((window as any).tizen || navigator.userAgent.includes('Tizen'));

    if (isTizen && (window as any).webapis && (window as any).webapis.avplay) {
      console.log("PLATINUM: Activation du moteur AVPlay (Native Samsung)");
      const avplay = (window as any).webapis.avplay;
      
      try {
        avplay.getAVPlay(
          (player: any) => {
            // Configuration AVPlay
            player.open(url);
            
            // Définir la zone d'affichage (Plein écran)
            player.setDisplayRect(0, 0, 1920, 1080);
            
            player.prepareAsync(() => {
              player.play();
              if (onReady) {
                // Bridge pour garder la compatibilité avec l'interface de contrôle
                onReady({
                  currentTime: (val?: number) => val !== undefined ? player.jumpTo(val * 1000) : player.getCurrentTime() / 1000,
                  duration: () => player.getDuration() / 1000,
                  play: () => player.play(),
                  pause: () => player.pause(),
                  paused: () => false, // Simplifié pour AVPlay
                  src: (s: string) => { player.stop(); player.open(s); player.prepareAsync(() => player.play()); },
                  dispose: () => { player.stop(); player.close(); },
                  isDisposed: () => false,
                  requestFullscreen: () => {},
                  exitFullscreen: () => {},
                  on: (ev: string, cb: any) => {}
                });
              }
            });
          },
          (err: any) => console.error("AVPlay Error", err)
        );
      } catch (e) {
        console.error("AVPlay Exception", e);
      }
      
      return () => {
        try { avplay.stop(); avplay.close(); } catch(e) {}
      };
    }

    // FALLBACK ARTPLAYER (Pour PC / Autres)
    const art = new Artplayer({
      container: artRef.current,
      url: url,
      autoplay: true,
      muted: false,
      theme: '#b5924d',
      lang: 'fr',
      hotkey: true,
      fullscreen: false,
      fullscreenWeb: false,
      icons: { state: '', play: '', pause: '', loading: '' },

      customType: {
        m3u8: function (video: HTMLVideoElement, url: string, art: any) {
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hls.loadSource(url);
            hls.attachMedia(video);
            art.hls = hls;
          }
        },
        ts: function (video: HTMLVideoElement, url: string) {
          // @ts-ignore
          if (mpegts.getFeatureList().mse) {
            const mpegtsPlayer = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url });
            mpegtsPlayer.attachMediaElement(video);
            mpegtsPlayer.load();
          }
        }
      },
    });

    playerInstance.current = art;

    art.on('video:timeupdate', () => {
      setCurrentTime(art.currentTime);
      setDuration(art.duration);
    });

    art.on('video:loadedmetadata', () => {
      setDuration(art.duration);
    });

    const vjsInterface = {
      currentTime: (val?: number) => val !== undefined ? (art.video.currentTime = val) : art.video.currentTime,
      duration: () => art.video.duration,
      play: () => art.video.play(),
      pause: () => art.video.pause(),
      get paused() { return art.video.paused; },
      
      audioTracks: function() {
        // @ts-ignore
        const hlsTracks = art.hls ? art.hls.audioTracks : [];
        // @ts-ignore
        const nativeTracks = art.video.audioTracks ? Array.from(art.video.audioTracks) : [];
        const tracks = hlsTracks.length > 0 ? hlsTracks : nativeTracks;
        
        const api = {
          length: tracks.length,
          addEventListener: () => {},
          removeEventListener: () => {},
        };

        tracks.forEach((t: any, i: number) => {
            // @ts-ignore
            api[i] = {
                id: i,
                label: t.name || t.label || `Piste ${i+1}`,
                get enabled() { 
                    // @ts-ignore
                    return art.hls ? art.hls.audioTrack === i : (t.enabled || false); 
                },
                set enabled(val: boolean) {
                  if (val) {
                    // @ts-ignore
                    if (art.hls) art.hls.audioTrack = i;
                    else if (tracks[i]) (tracks[i] as any).enabled = true;
                  }
                }
            };
        });

        return api;
      },

      src: (newSrc: any) => {
        const s = Array.isArray(newSrc) ? newSrc[0].src : (newSrc.src || newSrc);
        if (s && s !== art.url) art.switchUrl(s);
      },
      load: () => {}, 
      dispose: () => art.destroy(),
      isDisposed: () => art.isDestroy,
      isFullscreen: () => art.fullscreen,
      exitFullscreen: () => { art.fullscreen = false; },
      requestFullscreen: () => { art.fullscreen = true; },
      error: () => null,
      on: (event: string, cb: Function) => {
        if (event === 'play') art.video.addEventListener('play', () => cb());
        if (event === 'pause') art.video.addEventListener('pause', () => cb());
        if (event === 'error') art.video.addEventListener('error', (err) => cb(err));
        if (event === 'play' && !art.video.paused) cb();
      }
    };

    art.on('ready', () => {
      if (onReady) {
        onReady(vjsInterface);
      }
    });

    return () => {
      if (art && art.destroy) art.destroy();
    };
  }, [options.sources?.[0]?.src]);

  return (
    <div className="w-full h-full bg-black relative overflow-hidden group">
      <div 
        className="vjs-progress-control absolute bottom-0 left-0 right-0 h-2 bg-white/5 z-[100] cursor-pointer group/bar transition-all hover:h-4"
        onClick={handleSeek}
      >
        <div 
          className="vjs-play-progress h-full bg-[#b5924d] relative transition-all duration-75" 
          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} 
        >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full scale-0 group-hover/bar:scale-100 transition-transform shadow-xl" />
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .art-controls, .art-progress, .art-mini-progress, .art-mask, .art-state {
          display: none !important;
        }
        .artplayer-app {
          background: black !important;
        }
      `}} />
      <div 
        ref={artRef} 
        className="w-full h-full absolute inset-0"
      />
    </div>
  );
};

export default VideoPlayer;
