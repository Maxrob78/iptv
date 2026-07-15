import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { xtreamApi, LiveStream } from '../utils/xtream';
import { useDataStore } from '../store/useDataStore';
import { Sidebar } from '../components/Sidebar';
import { FavoriteButton } from '../components/FavoriteButton';
import FavoriteModal from '../components/FavoriteModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

export default function Channels() {
  const router = useRouter();
  const { channels, setChannels, checkAndClearCache } = useDataStore();
  const [loading, setLoading] = useState(channels.length === 0);
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [favModalItem, setFavModalItem] = useState<any>(null);

  const { ref, focusKey } = useFocusable({
    focusKey: 'CHANNELS'
  });

  // Sync Search with URL
  useEffect(() => {
    if (router.isReady && router.query.q) {
      setSearch(router.query.q as string);
      setDebouncedSearch(router.query.q as string);
    }
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
      setFocus('CHANNEL_SEARCH');
    }, 200);
    const fetchData = async () => {
      if (channels.length > 0) return;

      try {
        setLoading(true);
        const liveStreams = await xtreamApi.getLiveStreams();
        setChannels(liveStreams);
      } catch (err) {
        console.error("Erreur de récupération Live TV", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [channels.length, setChannels, checkAndClearCache]);

  const filteredChannels = useMemo(() => {
    if (!debouncedSearch) return channels.slice(0, 100);
    const lowerSearch = debouncedSearch.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(lowerSearch)).slice(0, 100);
  }, [channels, debouncedSearch]);


  const handlePlayChannel = (ch: LiveStream) => {
    if (launchingVideo) return; // Anti-double clic
    const streamUrl = xtreamApi.getStreamUrl(ch.stream_id, 'live', 'ts');
    setLaunchingVideo(ch.name);

    if ((window as any).electronAPI && (window as any).electronAPI.openMPV) {
      (window as any).electronAPI.openMPV({
        streamUrl,
        streamId: ch.stream_id,
        title: ch.name,
        type: 'live'
      });
    } else {
      router.push(`/player/${ch.stream_id}?type=live&extension=m3u8&title=${encodeURIComponent(ch.name)}`);
    }
    setTimeout(() => setLaunchingVideo(null), 3000);
  };

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white font-['Inter'] selection:bg-[#b5924d]/30">
      <FocusContext.Provider value={focusKey}>
        <Sidebar />
        <main ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar">

          {/* Notification Overlay */}
          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4 border border-white/20">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Ouverture : {launchingVideo}</span>
              </div>
            </div>
          )}
          {/* Atmosphere */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[10%] right-[-5%] w-[40%] h-[40%] bg-[#b5924d]/5 blur-[120px] rounded-full animate-pulse-slow" />
          </div>

          <header className="relative z-10 pt-32 pb-16 px-20">
            <div className="flex items-center space-x-6 mb-12 animate-in fade-in slide-in-from-left-10 duration-1000">
              <div className="w-16 h-[1px] bg-[#b5924d]/40" />
              <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Signaux Satellites</span>
            </div>
            <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-tight mb-16">
              CANAUX <span className="opacity-30 italic font-serif text-white/50">LIVE.</span>
            </h1>

            <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-200">
              <FocusableInput
                value={search}
                onChange={setSearch}
                placeholder="RECHERCHER UN SIGNAL..."
                containerRef={ref}
              />
            </div>
          </header>

          <div className="px-20 relative z-10 pb-40">
            {loading ? (
              <div className="py-24 animate-pulse">
                <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.4em]">Synchronisation des fréquences...</p>
              </div>
            ) : filteredChannels.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12 pt-32">
                {filteredChannels.map((ch: LiveStream, idx) => (
                  <FocusableChannel
                    key={ch.stream_id}
                    ch={ch}
                    idx={idx}
                    onClick={handlePlayChannel}
                    onLongPress={(item: any) => setFavModalItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-24">
                <p className="text-gray-700 text-[10px] font-medium uppercase tracking-[0.6em]">Aucune fréquence détectée.</p>
              </div>
            )}
          </div>

          {favModalItem && (
            <FavoriteModal
              item={favModalItem}
              onClose={() => {
                const cid = favModalItem.stream_id;
                setFavModalItem(null);
                setTimeout(() => setFocus(`CHANNEL_${cid}`), 100);
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
    focusKey: 'CHANNEL_SEARCH',
    onEnterPress: () => {
      ref.current.querySelector('input').focus();
    },
    onArrowPress: (direction) => direction !== 'up',
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
    <div
      ref={ref}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          (window as any).isMouseFocus = true;
          setFocus(focusKey);
          setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
        }
      }}
      className="relative group"
    >
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

function FocusableChannel({ ch, idx, onClick, onLongPress }: any) {
  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = React.useRef(false);
  const lastFocusTime = React.useRef(0);

  const { ref, focused, focusKey } = useFocusable({
    focusKey: `CHANNEL_${ch.stream_id}`,
    onFocus: () => {
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
        onLongPress(ch);
      }, 800);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
        if (!longPressTriggered.current) {
          onClick(ch);
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
      style={{ animationDelay: `${idx * 15}ms` }}
      className={`group relative animate-in zoom-in-95 duration-700 aspect-square ring-1 transition-all duration-300 outline-none
                   ${focused ? 'ring-[#b5924d] ring-4 scale-105 shadow-[0_40px_80px_rgba(181,146,77,0.4)] z-50' : 'ring-white/5 opacity-100'}`}
    >
      <div
        onClick={(e) => {
          if (e.detail > 0) onClick(ch);
        }}
        className="w-full h-full bg-[#0a0a0a] rounded-sm overflow-hidden cursor-pointer flex flex-col items-center justify-center p-6"
      >
        <div className={`relative w-full h-full flex items-center justify-center transition-transform duration-700 ${focused ? 'scale-110' : ''}`}>
          {ch.stream_icon ? (
            <img
              src={ch.stream_icon}
              onError={(e) => {
                const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23b5924d'%3ETV%3C/text%3E%3C/svg%3E";
                if (e.currentTarget.src !== fallback) { e.currentTarget.src = fallback; }
              }}
              alt=""
              className="w-full h-full object-contain filter drop-shadow-[0_0_30px_rgba(255,255,255,0.25)]"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-3xl opacity-40">📺</div>
          )}
        </div>
        <div className={`absolute inset-x-0 bottom-0 p-6 bg-black/60 transition-transform backdrop-blur-md border-t border-white/10 ${focused ? 'translate-y-0' : 'translate-y-full'}`}>
          <p className="text-xs text-center font-medium text-white truncate uppercase tracking-[0.2em]">{ch.name}</p>
        </div>
      </div>

      <div className={`absolute top-5 right-5 transition-all z-30 ${focused ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[-5px]'}`}>
        <FavoriteButton item={ch} />
      </div>
    </div>
  );
}
