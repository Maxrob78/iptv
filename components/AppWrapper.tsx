import React, { useEffect, useState, useRef } from 'react';
import { init } from '@noriginmedia/norigin-spatial-navigation';

init();
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuthStore, authStorage } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { RemoteListener } from './RemoteListener';
import localforage from 'localforage';

let hasBooted = false;

export default function AppWrapper({ Component, pageProps }: any) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState({ movies: 0, channels: 0, series: 0 });
  const prevIsRefreshing = useRef(false);
  const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    setMounted(true);

    const recoverLostAuth = async () => {
      // 1. On cherche dans les différents tiroirs si les codes sont cachés quelque part
      const storesToSearch = ['auth', 'data', 'ratings', 'keyvaluepairs'];
      let foundAuth: any = null;

      for (const sName of storesToSearch) {
        const tempStorage = localforage.createInstance({ name: 'iptv-platinum', storeName: sName });
        const data = await tempStorage.getItem('iptv-auth-storage');
        if (data && typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.state && parsed.state.isLoggedIn && parsed.state.serverUrl) {
              foundAuth = data;
              break;
            }
          } catch (e) { }
        }
      }

      // 2. Si on a trouvé des codes valides, on les force dans le bon tiroir 'auth'
      if (foundAuth) {
        await authStorage.setItem('iptv-auth-storage', foundAuth);
      }

      // 3. Hydratation manuelle après la vérification
      useAuthStore.persist.rehydrate();
      useDataStore.persist.rehydrate();
      useProfileStore.persist.rehydrate();
      useRatingStore.persist.rehydrate();
    };

    recoverLostAuth();

    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    // Gestion de l'inactivité
    let idleTimer: any;
    const resetTimer = () => {
      setIsIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsIdle(true);
      }, IDLE_TIMEOUT);
    };

    const handleGlobalBack = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        const active = document.activeElement;
        // Ne pas naviguer en arrière si on est dans un champ de texte
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          if (e.key === 'Escape') (active as HTMLElement).blur();
          return;
        }
        
        // Laisser le lecteur gérer son propre bouton retour (il gère déjà Escape/Backspace)
        if (window.location.pathname.includes('/player')) return;
        
        // Eviter de naviguer en arrière si une modale est ouverte. On cherche des conteneurs typiques de modales.
        const hasModal = document.querySelector('[role="dialog"]') || 
                         document.querySelector('.fixed.inset-0.z-50') ||
                         document.querySelector('[class*="modal"]');
        if (hasModal) return;

        // Ne pas retourner si on est à l'accueil
        const path = window.location.pathname;
        if (path !== '/' && path !== '/profiles' && path !== '/login') {
          router.back();
        }
      }
    };

    window.addEventListener('keydown', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', handleGlobalBack);
    resetTimer();

    return () => {
      unsub();
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', handleGlobalBack);
      clearTimeout(idleTimer);
    };
  }, [router]);

  const { activeProfile } = useProfileStore();
  const { isRefreshing } = useDataStore();

  // Détecter la fin du refresh — lire getState() directement pour avoir les counts frais
  useEffect(() => {
    if (prevIsRefreshing.current && !isRefreshing) {
      // getState() garantit les valeurs les plus récentes du store, pas le snapshot React
      const fresh = useDataStore.getState();
      setSuccessCount({
        movies: fresh.movies.length,
        channels: fresh.channels.length,
        series: fresh.series.length,
      });
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
    prevIsRefreshing.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    if (hydrated && mounted) {
      const state = useAuthStore.getState();

      // Proxy
      if (state.proxy && state.proxy.enabled) {
        // @ts-ignore
        window.electronAPI?.setProxy?.(state.proxy);
      }

      // Auto-Login & Profile Check
      if (!state.isLoggedIn && router.pathname !== '/login') {
        router.push('/login');
      } else if (state.isLoggedIn) {
        // Force l'écran des profils au premier démarrage (Netflix style)
        if (!hasBooted) {
          hasBooted = true;
          useProfileStore.getState().setActiveProfile(null);
          if (router.pathname !== '/profiles') {
            router.push('/profiles');
            return;
          }
        }

        // Redirection normale si aucun profil n'est actif
        if (!activeProfile && router.pathname !== '/profiles') {
          router.push('/profiles');
        }
      }
    }
  }, [hydrated, mounted, router, activeProfile]);

  if (!mounted) return <div className="bg-[#141414] min-h-screen" />;

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col pt-8 animate-in fade-in duration-1000">
      {/* Title Bar Electron Platinum */}
      <div className="h-10 w-full bg-black/40 backdrop-blur-2xl draggable flex justify-between items-center px-8 fixed top-0 z-[100] border-b border-white/[0.02]">
        <div className="flex items-center space-x-4">
          <div className="w-1 h-1 bg-[#b5924d] rounded-full shadow-[0_0_12px_#b5924d] animate-pulse" />
          <div className="flex items-baseline space-x-2">
            <span className="text-[10px] font-extralight text-white uppercase tracking-[0.7em] opacity-80">Platinum</span>
            <span className="text-[7px] font-medium text-[#b5924d]/40 uppercase tracking-[0.3em]">Studio Edition</span>
          </div>
        </div>
        <div className="no-drag flex items-center space-x-4">
          <div className="h-3 w-[1px] bg-white/5 mx-2" />
          <button className="w-3 h-3 rounded-full bg-white/5 hover:bg-orange-500/50 transition-all" onClick={() => (window as any).electronAPI?.windowMinimize?.()} />
          <button className="w-3 h-3 rounded-full bg-white/5 hover:bg-green-500/50 transition-all" onClick={() => (window as any).electronAPI?.windowMaximize?.()} />
          <button className="w-3 h-3 rounded-full bg-white/5 hover:bg-red-600/50 transition-all" onClick={() => (window as any).electronAPI?.windowClose?.()} />
        </div>
      </div>

      <RemoteListener />
      <Component {...pageProps} />

      {/* Écran de chargement global — Refresh Catalogue */}
      {isRefreshing && (
        <div className="fixed inset-0 z-[9998] bg-[#050505] flex items-center justify-center animate-in fade-in duration-500">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#b5924d]/8 blur-[200px] rounded-full animate-pulse" />
          </div>

          <div className="relative flex flex-col items-center gap-16">
            {/* Logo animé */}
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#b5924d] to-[#7a5f2a] flex items-center justify-center shadow-[0_0_80px_rgba(181,146,77,0.4)] animate-pulse">
                <span className="text-4xl font-black text-black font-serif italic">P</span>
              </div>
              {/* Orbit ring */}
              <div className="absolute -inset-4 rounded-full border border-[#b5924d]/20 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute -inset-8 rounded-full border border-[#b5924d]/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }} />
            </div>

            {/* Texte */}
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.6em] text-[#b5924d]">Mise à jour du catalogue</h2>
              <p className="text-[9px] font-light uppercase tracking-[0.4em] text-white/30">Synchronisation en cours...</p>
            </div>

            {/* Barre de progression animée */}
            <div className="w-64 h-[1px] bg-white/5 relative overflow-hidden rounded-full">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-[#b5924d] to-transparent w-1/2 animate-[shimmer_1.5s_ease-in-out_infinite]" />
            </div>

            {/* Labels */}
            <div className="flex items-center gap-8 text-[8px] uppercase tracking-[0.4em] text-white/20 font-medium">
              <span>Films</span>
              <div className="w-1 h-1 bg-[#b5924d]/40 rounded-full" />
              <span>Chaînes</span>
              <div className="w-1 h-1 bg-[#b5924d]/40 rounded-full" />
              <span>Séries</span>
            </div>
          </div>
        </div>
      )}

      {/* Overlay succès — affiche le nombre de vidéos */}
      {showSuccess && !isRefreshing && (
        <div className="fixed inset-0 z-[9997] bg-black/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-500">
          <div className="relative bg-[#0a0a0a] border border-[#b5924d]/30 rounded-2xl p-16 flex flex-col items-center gap-10 shadow-[0_0_120px_rgba(181,146,77,0.15)] animate-in zoom-in-95 duration-500">
            {/* Checkmark */}
            <div className="w-16 h-16 rounded-full bg-[#b5924d]/10 border border-[#b5924d]/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#b5924d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="flex flex-col items-center gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.6em] text-[#b5924d]">Catalogue mis à jour</h3>
              <p className="text-[8px] uppercase tracking-[0.3em] text-white/30">Index complet disponible</p>
            </div>

            {/* Stats */}
            <div className="flex items-stretch gap-8">
              <div className="flex flex-col items-center gap-2 px-8 py-5 bg-white/[0.02] rounded-xl border border-white/5">
                <span className="text-3xl font-extralight text-white">{successCount.movies.toLocaleString('fr-FR')}</span>
                <span className="text-[8px] uppercase tracking-[0.4em] text-[#b5924d]/60 font-medium">Films</span>
              </div>
              <div className="w-[1px] bg-white/5 self-stretch" />
              <div className="flex flex-col items-center gap-2 px-8 py-5 bg-white/[0.02] rounded-xl border border-white/5">
                <span className="text-3xl font-extralight text-white">{successCount.channels.toLocaleString('fr-FR')}</span>
                <span className="text-[8px] uppercase tracking-[0.4em] text-[#b5924d]/60 font-medium">Chaînes</span>
              </div>
              <div className="w-[1px] bg-white/5 self-stretch" />
              <div className="flex flex-col items-center gap-2 px-8 py-5 bg-white/[0.02] rounded-xl border border-white/5">
                <span className="text-3xl font-extralight text-white">{successCount.series.toLocaleString('fr-FR')}</span>
                <span className="text-[8px] uppercase tracking-[0.4em] text-[#b5924d]/60 font-medium">Séries</span>
              </div>
            </div>

            <p className="text-[8px] text-white/15 uppercase tracking-widest">Fermeture automatique...</p>
          </div>
        </div>
      )}

      {/* Screensaver Anti-Marquage (The Frame Optimization) */}
      {isIdle && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center animate-in fade-in duration-1000">
          <div className="flex flex-col items-center animate-pulse">
            <div className="w-16 h-16 border-2 border-[#b5924d]/20 rounded-full flex items-center justify-center mb-8">
              <div className="w-2 h-2 bg-[#b5924d] rounded-full shadow-[0_0_20px_#b5924d]" />
            </div>
            <span className="text-[10px] font-extralight text-white/20 uppercase tracking-[1em] ml-[1em]">Veille Active</span>
            <p className="text-[8px] text-white/5 mt-12 uppercase tracking-widest">Pressez une touche pour réveiller</p>
          </div>
        </div>
      )}
    </div>
  );
}
