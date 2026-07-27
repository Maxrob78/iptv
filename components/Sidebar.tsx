import React from 'react';
import { useRouter } from 'next/router';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useProfileStore } from '../store/useProfileStore';
import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';

export function Sidebar() {
  const router = useRouter();
  const [isTV, setIsTV] = React.useState(false);
  const { activeProfile, setActiveProfile } = useProfileStore();
  const { startRefresh } = useDataStore();
  const { expDate, checkAuth } = useAuthStore();

  React.useEffect(() => {
    checkAuth();
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('tizen') || userAgent.includes('webos') || (window as any).tizen) {
      setIsTV(true);
    }
  }, []);

  const { ref, focusKey } = useFocusable({
    focusKey: 'SIDEBAR',
    trackChildren: true,
    saveLastFocusedChild: true,
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <aside
        ref={ref}
        className="w-20 lg:w-72 bg-black/40 backdrop-blur-3xl border-r border-[#b5924d]/10 flex flex-col fixed h-full z-40 transition-all duration-500 font-['Inter'] shadow-[20px_0_50px_rgba(0,0,0,0.5)]"
      >
        <div className="p-8 flex justify-center lg:justify-start items-center space-x-4 group">
          <div className="w-10 h-10 bg-gradient-to-br from-[#b5924d] to-[#7a5f2a] rounded-xl font-black flex items-center justify-center text-xl shadow-lg shadow-[#b5924d]/20 text-black font-serif italic">P</div>
          <div className="hidden lg:block">
            <h2 className="font-extralight text-xl tracking-[0.2em] text-white">PLATINUM</h2>
            <p className="text-[7px] font-black tracking-[0.5em] text-[#b5924d] uppercase opacity-60">Signature Edition</p>
          </div>
        </div>

        <nav className="flex-1 mt-12 space-y-2 px-4">
          <NavButton customFocusKey="NAV_INDEX" icon="🏠" label="Index" active={router.pathname === '/'} onClick={() => router.push('/')} isFirst={true} />
          <NavButton customFocusKey="NAV_MOVIES" icon="🎬" label="Cinéma" active={router.pathname.includes('/movies')} onClick={() => router.push('/movies')} />
          <NavButton customFocusKey="NAV_CHANNELS" icon="📺" label="Canaux" active={router.pathname.includes('/channels')} onClick={() => router.push('/channels')} />
          <NavButton customFocusKey="NAV_SERIES" icon="🍿" label="Séries" active={router.pathname.includes('/series')} onClick={() => router.push('/series')} />
          <NavButton customFocusKey="NAV_FAVORITES" icon="✨" label="Favoris" active={router.pathname.includes('/favorites')} onClick={() => router.push('/favorites')} />
          <NavButton customFocusKey="NAV_REMOTE" icon="📱" label="Remote" active={router.pathname.includes('/remote')} onClick={() => router.push('/remote')} />
          <NavButton
            customFocusKey="NAV_REFRESH"
            icon="🔄"
            label="Actualiser"
            onClick={() => {
              (window as any).hasJustRefreshed = true;
              startRefresh();
              if (router.pathname !== '/') {
                router.push('/');
              }
              // Force le focus à rester sur le bouton après le rechargement et la navigation
              setTimeout(() => setFocus('NAV_REFRESH'), 50);
              setTimeout(() => setFocus('NAV_REFRESH'), 250);
              setTimeout(() => setFocus('NAV_REFRESH'), 500); // Double sécurité
            }}
          />

          <div className="pt-8 mt-8 border-t border-white/5">
            <NavButton
              isProfile={true}
              icon={activeProfile ? <ProfileAvatar src={activeProfile.avatar} /> : <span className="text-3xl">🎭</span>}
              label={activeProfile ? activeProfile.name : "Profils"}
              active={router.pathname === '/profiles'}
              onClick={() => {
                router.push('/profiles');
              }}
              isLast={true}
            />
            {activeProfile && expDate && (
              <div className="hidden lg:block mt-1 text-center">
                <span className="text-[9px] uppercase tracking-[0.2em] font-black opacity-30 text-[#b5924d]">Expire le : {expDate}</span>
              </div>
            )}
          </div>
        </nav>
      </aside>
    </FocusContext.Provider>
  );
}

function NavButton({ icon, label, active = false, onClick, isFirst, isLast, customFocusKey, isProfile }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, isFirst?: boolean, isLast?: boolean, customFocusKey?: string, isProfile?: boolean }) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'left') return false;
      if (direction === 'right') {
        const path = window.location.pathname;
        if (path.includes('/movie/')) {
          setFocus('MOVIE_MAIN_CONTENT');
        } else if (path === '/' || path === '') {
          if ((window as any).hasJustRefreshed) {
            setFocus('HERO_RESUME');
            (window as any).hasJustRefreshed = false;
          } else {
            setFocus('MAIN_CONTENT');
          }
        } else {
          setFocus('MAIN_CONTENT');
        }
        return false;
      }
      if (direction === 'up' && isFirst) return false;
      if (direction === 'down' && isLast) return false;
      return true;
    }
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => setFocus(focusKey)}
      className={`w-full flex items-center space-x-5 px-6 py-4 rounded-2xl transition-all duration-300 group border relative overflow-hidden
                 ${focused ? 'bg-gradient-to-r from-[#b5924d]/20 to-transparent border-[#b5924d]/50 scale-[1.02] shadow-[0_0_30px_rgba(181,146,77,0.15)]' : 'border-transparent'}
                 ${active ? 'bg-white/[0.05] text-white shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r from-[#b5924d]/0 via-[#b5924d]/10 to-transparent translate-x-[-100%] transition-transform duration-700 ${focused ? 'translate-x-[100%]' : ''}`} />
      <span className={`flex items-center justify-center transition-all duration-300 z-10 transform-gpu ${isProfile ? '' : 'text-xl'} ${active || focused ? 'scale-110' : ''} ${!isProfile && (active || focused) ? 'drop-shadow-[0_0_12px_rgba(181,146,77,0.8)]' : ''} ${!isProfile ? (active || focused ? 'grayscale-0' : 'grayscale group-hover:grayscale-0') : ''}`}>{icon}</span>
      <span className={`hidden lg:block ${isProfile ? 'text-[13px] tracking-[0.4em]' : 'text-[11px] tracking-[0.3em]'} font-bold uppercase z-10 transition-colors ${active || focused ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{label}</span>
      {(active || focused) && <div className="ml-auto w-1.5 h-1.5 bg-[#b5924d] rounded-full shadow-[0_0_10px_#b5924d]" />}
    </button>
  );
}

function ProfileAvatar({ src }: { src: string }) {
  const [blurred, setBlurred] = React.useState(false);

  React.useEffect(() => {
    setBlurred(false);
    // Force un repaint sur un frame ultérieur : contourne le bug WebKit TV
    // où filter: blur() n'est appliqué qu'après un repaint déclenché
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setBlurred(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [src]);

  return (
    <img
      src={src}
      alt=""
      onLoad={() => setBlurred(true)} // filet de sécurité si l'image vient du cache
      className={`w-12 h-12 rounded-full border border-white/20 object-cover transition-[filter] duration-100 ${blurred ? 'blur-[0.5px]' : ''
        }`}
    />
  );
}
