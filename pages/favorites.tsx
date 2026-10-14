import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { Sidebar } from '../components/Sidebar';
import { xtreamApi } from '../utils/xtream';
import { ResumeModal } from '../components/ResumeModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { restoreFocusSafely } from '../utils/focusRestoration';

// ─── Global mouse / key mode tracker ─────────────────────────────────────────
let lastMouseX = -1;
let lastMouseY = -1;
let isMouseMode = false;
let lastFocusedFavKey: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    if (e.clientX !== lastMouseX || e.clientY !== lastMouseY) {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      isMouseMode = true;
    }
  });
  window.addEventListener('keydown', () => { isMouseMode = false; });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FavoritesPage() {
  const router = useRouter();
  const { getProfileData, removeCategory, removeItemFromCategory, moveCategory, moveItemInCategory, addCategory, hydrateHeavyData } = useDataStore();
  const { favoriteCategories } = getProfileData();
  const [mounted, setMounted] = useState(false);
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean; item: any; time: number }>({
    isOpen: false, item: null, time: 0,
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
    preferredChildFocusKey: favoriteCategories.length > 0 ? `CAT_TITLE_${favoriteCategories[0].id}` : undefined,
    saveLastFocusedChild: true,
    trackChildren: true,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      return true;
    }
  });

  useEffect(() => {
    setMounted(true);
    hydrateHeavyData().catch(() => {});
    if ((window as any).electronAPI && (window as any).electronAPI.on) {
      return (window as any).electronAPI.on('mpv-status', (data: any) => {
        if (data && (data.status === 'error' || data.status === 'closed')) {
          setLaunchingVideo(null);
        }
      });
    }
  }, [hydrateHeavyData]);

  useEffect(() => {
    if (mounted) {
      const prevRoute = (window as any).__previousRoute || (typeof window !== 'undefined' ? sessionStorage.getItem('__previousRoute') : null);
      const isFromDetail = prevRoute === '/movie/[id]' || prevRoute === '/series/[id]' || prevRoute === '/player/[id]' ||
        (typeof prevRoute === 'string' && (prevRoute.startsWith('/movie/') || prevRoute.startsWith('/series/') || prevRoute.startsWith('/player/')));

      const savedKey = (window as any).__lastFavClickedItem || (typeof window !== 'undefined' ? sessionStorage.getItem('fav_clicked_key') : null);

      if (!isFromDetail) {
        lastFocusedFavKey = null;
        (window as any).__lastFocusedFavKey = null;
        (window as any).__lastFavClickedItem = null;
        try {
          sessionStorage.removeItem('fav_clicked_key');
        } catch (e) {}
      }

      const defaultKey = favoriteCategories.length > 0 ? 'FIRST_FAV_TITLE' : 'CREATE_FIRST_CAT_BTN';
      const targetKey = (isFromDetail && (savedKey || lastFocusedFavKey))
        ? (savedKey || lastFocusedFavKey)
        : defaultKey;

      const cleanupFocus = restoreFocusSafely({
        targetKey,
        fallbackKey: defaultKey,
        delays: [50, 150, 350],
        onSuccess: (key) => {
          if (isFromDetail) {
            lastFocusedFavKey = key;
            (window as any).__lastFocusedFavKey = key;
          }
        },
        onInitialSetup: () => {
          if (!isFromDetail) {
            if (ref.current) {
              ref.current.scrollTop = 0;
            }
            window.scrollTo({ top: 0, behavior: 'auto' });
          }
        }
      });

      return () => {
        cleanupFocus();
      };
    }
  }, [mounted, favoriteCategories.length]);

  if (!mounted) return null;

  const handlePlay = (item: any, forcedStartTime?: number) => {
    if (launchingVideo) return;
    const id = item.series_id || item.seriesId || item.stream_id || item.id;

    // Détection ultra-robuste du type
    let type: 'series' | 'movie' | 'live' = 'movie';

    if (
      item.type === 'series' ||
      item.stream_type === 'series' ||
      item.series_id ||
      item.seriesId ||
      item.seasons ||
      item.episode_run_time
    ) {
      type = 'series';
    } else if (
      item.type === 'live' ||
      item.stream_type === 'live' ||
      item.type === 'channel' ||
      item.epg_channel_id !== undefined ||
      item.tv_archive !== undefined
    ) {
      type = 'live';
    } else if (item.type === 'movie' || item.stream_type === 'movie') {
      type = 'movie';
    } else {
      // Vérification croisée avec le store Zustand pour les fiches ajoutées avec des métadonnées partielles
      const store = useDataStore.getState();
      const strId = String(id);
      if (store.series?.some((s: any) => String(s.series_id || s.id) === strId)) {
        type = 'series';
      } else if (store.channels?.some((c: any) => String(c.stream_id || c.id) === strId)) {
        type = 'live';
      } else {
        type = item.container_extension ? 'movie' : 'live';
      }
    }

    const ext = item.container_extension || (type === 'live' ? 'ts' : 'm3u8');

    if (item.isLocal) {
      if (item.type === 'series' || type === 'series') router.push(`/series/local-${id}`);
      else router.push(`/movie/local-${id}`);
      return;
    }

    if (type === 'series') { router.push(`/series/${id}`); return; }
    if (type === 'movie') { router.push(`/movie/${id}`); return; }

    const activeProfileId = useProfileStore.getState().activeProfile?.id;
    const historyKey = activeProfileId ? `iptv_playback_history_${activeProfileId}` : 'iptv_playback_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
    let startTime = forcedStartTime ?? 0;

    if (type !== 'live' && history[id] && forcedStartTime === undefined) {
      const savedTime = history[id].currentTime;
      if (savedTime > 10) { setResumeModal({ isOpen: true, item, time: savedTime }); return; }
    }

    const streamUrl = xtreamApi.getStreamUrl(id, type as any, ext);
    setLaunchingVideo(item.name);
    if ((window as any).electronAPI?.openMPV) {
      (window as any).electronAPI.openMPV({ streamUrl, streamId: id, title: item.name || item.title, type, startTime });
    } else {
      router.push(`/player/${id}?type=${type}&extension=${ext}&title=${encodeURIComponent(item.name)}&start=${startTime}`);
    }
    setTimeout(() => setLaunchingVideo(null), 3000);
  };

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white font-['Inter'] selection:bg-[#b5924d]/30">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-72 3xl:ml-96 flex-1 relative overflow-y-auto no-scrollbar pb-40">

          {launchingVideo && (
            <div className="fixed bottom-12 right-12 z-[100] animate-in slide-in-from-right-10 duration-500">
              <div className="bg-[#b5924d] text-black px-8 py-4 rounded-sm shadow-2xl flex items-center space-x-4">
                <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Favori : {launchingVideo}</span>
              </div>
            </div>
          )}

          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#b5924d]/5 blur-[200px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/[0.02] blur-[150px] rounded-full" />
          </div>

          <header className="relative z-10 pt-28 pb-16 px-20">
            <div className="flex items-center space-x-6 mb-8">
              <div className="w-16 h-[1px] bg-[#b5924d]/40" />
              <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Archives Personnelles</span>
            </div>
            <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-tight text-white mb-10">
              MES <span className="opacity-30 italic font-serif text-white/50">COLLECTIONS.</span>
            </h1>
            {favoriteCategories.length > 0 && (
              <div className="flex items-center space-x-4 pt-2">
                <FocusableHeaderAddButton onAdd={(name: string) => addCategory(name)} />
              </div>
            )}
          </header>

          <div className="px-20 relative z-10 space-y-40 pb-40">
            {favoriteCategories.length === 0 ? (
              <div className="py-24 text-center border border-white/5 rounded-sm bg-white/[0.01] flex flex-col items-center justify-center space-y-6">
                <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.4em]">Aucun Registre Indexé</p>
                <FocusableEmptyAddButton onAdd={(name: string) => addCategory(name)} />
              </div>
            ) : (
              favoriteCategories.map((cat, catIdx) => (
                <FocusableCategory
                  key={cat.id} cat={cat} catIdx={catIdx}
                  totalCategories={favoriteCategories.length}
                  allCategories={favoriteCategories}
                  moveCategory={moveCategory} removeCategory={removeCategory}
                  moveItemInCategory={moveItemInCategory} removeItemFromCategory={removeItemFromCategory}
                  handlePlay={handlePlay}
                />
              ))
            )}
          </div>

          <ResumeModal
            isOpen={resumeModal.isOpen} title={resumeModal.item?.name || ''} time={resumeModal.time}
            onClose={() => setResumeModal({ ...resumeModal, isOpen: false })}
            onConfirm={() => { const { item, time } = resumeModal; setResumeModal({ ...resumeModal, isOpen: false }); handlePlay(item, time); }}
            onStartOver={() => { const { item } = resumeModal; setResumeModal({ ...resumeModal, isOpen: false }); handlePlay(item, 0); }}
          />
        </main>
      </FocusContext.Provider>
    </div>
  );
}

// ─── Header New Collection button ───────────────────────────────────────────

function FocusableHeaderAddButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');

  const { ref, focused, focusKey } = useFocusable({
    focusKey: 'HEADER_ADD_CAT_BTN',
    onEnterPress: () => {
      if (!isEditing) setIsEditing(true);
    },
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      if (direction === 'down') {
        setFocus('FIRST_FAV_TITLE');
        return false;
      }
      if (direction === 'up' || direction === 'right') {
        // Stop bubbling so Norigin never loses focus into undefined space
        return false;
      }
      return true;
    },
    onFocus: () => {
      lastFocusedFavKey = 'HEADER_ADD_CAT_BTN';
      (window as any).__lastFocusedFavKey = 'HEADER_ADD_CAT_BTN';
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  const submit = () => {
    const finalName = name.trim();
    setIsEditing(false);
    setName('');
    if (finalName) {
      onAdd(finalName);
      setTimeout(() => {
        try {
          setFocus('FIRST_FAV_TITLE');
          lastFocusedFavKey = 'FIRST_FAV_TITLE';
        } catch {
          setFocus('NAV_FAVORITES');
        }
      }, 150);
    } else {
      setTimeout(() => setFocus('HEADER_ADD_CAT_BTN'), 50);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-3 animate-in fade-in duration-200">
        <input
          type="text"
          autoFocus
          value={name}
          placeholder="Nom de la collection..."
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              setIsEditing(false);
              setTimeout(() => setFocus('HEADER_ADD_CAT_BTN'), 50);
            }
          }}
          onBlur={submit}
          className="bg-black/95 border-2 border-[#b5924d] text-white px-5 py-3 rounded-sm text-xs uppercase tracking-widest outline-none shadow-2xl min-w-[260px]"
        />
        <button
          onClick={submit}
          className="bg-[#b5924d] text-black font-black px-5 py-3 rounded-sm text-[10px] uppercase tracking-widest hover:bg-white transition-colors"
        >
          Créer
        </button>
      </div>
    );
  }

  return (
    <button
      ref={ref}
      onClick={() => setIsEditing(true)}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`px-6 py-3.5 border text-[10px] font-bold uppercase tracking-[0.3em] rounded-sm transition-all outline-none flex items-center space-x-3 shadow-lg
        ${focused
          ? 'bg-white text-black scale-105 shadow-[0_0_30px_rgba(255,255,255,0.6)] border-white ring-2 ring-[#b5924d]'
          : 'text-[#b5924d] border-[#b5924d]/40 hover:border-[#b5924d] bg-white/[0.02] hover:bg-white/[0.05]'}`}
    >
      <span className={`text-lg font-light leading-none ${focused ? 'text-black font-black' : 'text-[#b5924d]'}`}>+</span>
      <span className={focused ? 'text-black font-black' : ''}>Nouvelle Collection</span>
    </button>
  );
}

// ─── Empty state add button ──────────────────────────────────────────────────

function FocusableEmptyAddButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');

  const { ref, focused, focusKey } = useFocusable({
    focusKey: 'CREATE_FIRST_CAT_BTN',
    onEnterPress: () => {
      if (!isEditing) setIsEditing(true);
    },
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      if (direction === 'up') {
        return false;
      }
      return true;
    }
  });

  const submit = () => {
    const finalName = name.trim() || 'Favoris';
    setIsEditing(false);
    setName('');
    onAdd(finalName);
    setTimeout(() => {
      try {
        setFocus('FIRST_FAV_TITLE');
        lastFocusedFavKey = 'FIRST_FAV_TITLE';
      } catch {
        setFocus('NAV_FAVORITES');
      }
    }, 150);
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-3 animate-in fade-in duration-200">
        <input
          type="text"
          autoFocus
          value={name}
          placeholder="Nom de la collection"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              setIsEditing(false);
              setTimeout(() => setFocus(focusKey), 50);
            }
          }}
          onBlur={submit}
          className="bg-black/90 border border-[#b5924d] text-white px-5 py-2.5 rounded-sm text-xs uppercase tracking-widest outline-none shadow-xl"
        />
        <button
          onClick={submit}
          className="bg-[#b5924d] text-black px-4 py-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-colors"
        >
          Valider
        </button>
      </div>
    );
  }

  return (
    <button
      ref={ref}
      onClick={() => setIsEditing(true)}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`px-6 py-3 border text-[10px] font-bold uppercase tracking-[0.3em] rounded-sm transition-all outline-none flex items-center space-x-3
        ${focused
          ? 'bg-white text-black scale-105 shadow-[0_0_25px_rgba(255,255,255,0.4)] border-white'
          : 'text-[#b5924d] border-[#b5924d]/40 hover:border-[#b5924d] bg-black/40'}`}
    >
      <span className="text-base font-light leading-none">+</span>
      <span>Créer une collection</span>
    </button>
  );
}

// ─── Category ────────────────────────────────────────────────────────────────

const FocusableCategory = React.memo(function FocusableCategory({
  cat, catIdx, totalCategories, allCategories, moveCategory, removeCategory, moveItemInCategory, removeItemFromCategory, handlePlay
}: any) {
  const { ref, focusKey } = useFocusable({
    onArrowPress: (direction) => {
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      return true;
    }
  });
  const setCategorySortOrder = useDataStore(state => state.setCategorySortOrder);
  const renameCategory = useDataStore(state => state.renameCategory);
  const profileId = useProfileStore.getState().activeProfile?.id || 'default';
  const ratings = useRatingStore(state => state.ratings[profileId]) || {};
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isFirstCat = catIdx === 0;
  const isLastCat = catIdx === (totalCategories || 1) - 1;

  const sortedItems = useMemo(() => {
    const sortOrder = cat.sortOrder || 'default';
    let items = [...cat.items];

    const extractDateFromTitle = (title: string): number => {
      if (!title) return 0;

      // 1. Chercher toutes les dates complètes (YYYY-MM-DD, DD/MM/YYYY, etc.) et prendre la DERNIÈRE
      const fullDateRegex = /\b(?:(\d{4})[-\.](\d{2})[-\.](\d{2})|(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})|(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2}))\b/g;
      let match: RegExpExecArray | null;
      let lastFullDateTs = 0;

      while ((match = fullDateRegex.exec(title)) !== null) {
        if (match[1] && match[2] && match[3]) {
          // YYYY-MM-DD
          const ts = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
          if (!isNaN(ts)) lastFullDateTs = ts;
        } else if (match[4] && match[5] && match[6]) {
          // DD/MM/YYYY
          const ts = new Date(parseInt(match[6]), parseInt(match[5]) - 1, parseInt(match[4])).getTime();
          if (!isNaN(ts)) lastFullDateTs = ts;
        } else if (match[7] && match[8] && match[9]) {
          // DD/MM/YY
          let year = parseInt(match[9]);
          year += year > 50 ? 1900 : 2000;
          const ts = new Date(year, parseInt(match[8]) - 1, parseInt(match[7])).getTime();
          if (!isNaN(ts)) lastFullDateTs = ts;
        }
      }

      if (lastFullDateTs > 0) return lastFullDateTs;

      // 2. Si pas de date complète, chercher toutes les années (4 chiffres) et prendre la DERNIÈRE mentionnée
      const yearMatches = title.match(/\b(19\d{2}|20\d{2})\b/g);
      if (yearMatches && yearMatches.length > 0) {
        const lastYear = parseInt(yearMatches[yearMatches.length - 1]);
        const ts = new Date(lastYear, 0, 1).getTime();
        if (!isNaN(ts)) return ts;
      }

      return 0;
    };

    const getItemDate = (item: any): number => {
      if (!item) return 0;
      // 1. Métadonnées directes prioritaires
      if (item.release_date || item.releasedate) {
        const raw = String(item.release_date || item.releasedate).trim();
        const parsed = Date.parse(raw);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      if (item.year) {
        const y = parseInt(String(item.year).trim());
        if (!isNaN(y) && y >= 1900 && y <= 2100) {
          return new Date(y, 0, 1).getTime();
        }
      }
      if (item.added) {
        const addedNum = parseInt(String(item.added).trim());
        if (!isNaN(addedNum) && addedNum > 0) {
          return addedNum < 1e11 ? addedNum * 1000 : addedNum;
        }
      }
      if (item._addedAt && typeof item._addedAt === 'number' && item._addedAt > 0) {
        return item._addedAt;
      }

      // 2. Fallback dans le titre (dernière date/année mentionnée)
      return extractDateFromTitle(item.name || item.title || '');
    };

    if (sortOrder === 'date_desc' || sortOrder === 'date') {
      items.sort((a, b) => getItemDate(b) - getItemDate(a));
    } else if (sortOrder === 'date_asc') {
      items.sort((a, b) => getItemDate(a) - getItemDate(b));
    } else if (sortOrder === 'alpha_asc') {
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'alpha_desc') {
      items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortOrder === 'rating_desc' || sortOrder === 'rating') {
      items.sort((a, b) => {
        const rA = ratings[String(a.stream_id || a.series_id || a.id)]?.rating || 0;
        const rB = ratings[String(b.stream_id || b.series_id || b.id)]?.rating || 0;
        return rB - rA;
      });
    } else if (sortOrder === 'rating_asc') {
      items.sort((a, b) => {
        const rA = ratings[String(a.stream_id || a.series_id || a.id)]?.rating || 0;
        const rB = ratings[String(b.stream_id || b.series_id || b.id)]?.rating || 0;
        return rA - rB;
      });
    }
    return items;
  }, [cat.items, cat.sortOrder, ratings]);

  const handleRemove = (catId: string, itemId: string) => {
    const idx = sortedItems.findIndex((i: any) => (i.stream_id || i.series_id || i.id) === itemId);
    if (idx !== -1) {
      let nextFocusKey = '';
      if (sortedItems.length === 1) {
        nextFocusKey = catIdx === 0 ? 'FIRST_FAV_TITLE' : `CAT_TITLE_${catId}`;
      } else if (idx < sortedItems.length - 1) {
        const nextIdx = idx + 1;
        const rightItem = sortedItems[nextIdx];
        const rightId = rightItem.stream_id || rightItem.series_id || rightItem.id;
        const willBeFirst = catIdx === 0 && idx === 0;
        nextFocusKey = willBeFirst ? 'FIRST_FAV_ITEM' : `IMG_${catId}_${rightId}`;
      } else {
        const leftIdx = idx - 1;
        const leftItem = sortedItems[leftIdx];
        const leftId = leftItem.stream_id || leftItem.series_id || leftItem.id;
        const willBeFirst = catIdx === 0 && leftIdx === 0;
        nextFocusKey = willBeFirst ? 'FIRST_FAV_ITEM' : `IMG_${catId}_${leftId}`;
      }

      removeItemFromCategory(catId, itemId);
      lastFocusedFavKey = nextFocusKey;
      setTimeout(() => {
        try {
          setFocus(nextFocusKey);
        } catch (e) {
          setFocus(catIdx === 0 ? 'FIRST_FAV_TITLE' : `CAT_TITLE_${catId}`);
        }
      }, 150);
    } else {
      removeItemFromCategory(catId, itemId);
    }
  };

  const handleDissolveCategory = () => {
    let nextKey = 'NAV_FAVORITES';
    if (allCategories && allCategories.length > 1) {
      if (catIdx === 0) {
        nextKey = 'FIRST_FAV_TITLE';
      } else if (catIdx < allCategories.length - 1) {
        nextKey = `CAT_TITLE_${allCategories[catIdx + 1].id}`;
      } else {
        const prevIdx = catIdx - 1;
        nextKey = prevIdx === 0 ? 'FIRST_FAV_TITLE' : `CAT_TITLE_${allCategories[prevIdx].id}`;
      }
    } else {
      nextKey = 'CREATE_FIRST_CAT_BTN';
    }

    removeCategory(cat.id);
    setTimeout(() => {
      try {
        setFocus(nextKey);
        lastFocusedFavKey = nextKey;
      } catch (e) {
        setFocus('NAV_FAVORITES');
      }
    }, 100);
  };

  const handleMove = (catId: string, itemId: string, direction: 'left' | 'right') => {
    const idx = sortedItems.findIndex((i: any) => (i.stream_id || i.series_id || i.id) === itemId);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < sortedItems.length) {
      const targetItem = sortedItems[targetIdx];
      const targetId = targetItem.stream_id || targetItem.series_id || targetItem.id;
      moveItemInCategory(catId, itemId, targetId);
    }
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref}>
        <div className="flex items-end justify-between mb-12 border-b border-white/[0.05] pb-8">
          <div className="flex items-center space-x-10">
            <div className="flex items-center space-x-4">
              <FocusableCategoryTitle cat={cat} onRename={(newName: string) => renameCategory(cat.id, newName)} blockUp={catIdx === 0} />
              <span className="text-[9px] font-bold text-gray-600 border border-white/10 px-3 py-1 tracking-widest uppercase">{cat.items.length} INDEX</span>
            </div>
            <div className="flex items-center space-x-2 border-l border-white/5 pl-10">
              <SortDropdown catId={cat.id} currentSort={cat.sortOrder} setSortOrder={setCategorySortOrder} blockUp={catIdx === 0} />
              <FocusableButton
                blockUp={catIdx === 0}
                disabled={isFirstCat}
                onClick={isFirstCat ? undefined : () => moveCategory(cat.id, 'up')}
                icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>} />
              <FocusableButton
                blockUp={catIdx === 0}
                disabled={isLastCat}
                onClick={isLastCat ? undefined : () => moveCategory(cat.id, 'down')}
                icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>} />
            </div>
          </div>
          {confirmDelete ? (
            <div className="flex space-x-2 animate-in fade-in zoom-in duration-200">
              <FocusableButton
                blockUp={catIdx === 0}
                onClick={handleDissolveCategory}
                label="Confirmer"
                variant="danger"
              />
              <FocusableButton
                blockUp={catIdx === 0}
                onClick={() => setConfirmDelete(false)}
                label="Annuler"
              />
            </div>
          ) : (
            <FocusableButton
              blockUp={catIdx === 0}
              onClick={() => setConfirmDelete(true)}
              label="Dissoudre la section"
              variant="danger"
            />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12 items-start">
          {sortedItems.length === 0 ? (
            <div className="col-span-full py-20 bg-white/[0.02] border border-white/5 rounded-sm text-center">
              <p className="text-gray-700 text-[10px] font-medium uppercase tracking-[0.6em]">Registre Vierge</p>
            </div>
          ) : (
            sortedItems.map((item: any, idx: number) => (
              <FocusableFavoriteCard
                key={item.stream_id || item.series_id || item.id}
                item={item} catId={cat.id} onPlay={handlePlay}
                onRemove={handleRemove} onMove={handleMove}
                isFirstItem={catIdx === 0 && idx === 0}
              />
            ))
          )}
        </div>
      </section>
    </FocusContext.Provider>
  );
});

// ─── Category Title ──────────────────────────────────────────────────────────

function FocusableCategoryTitle({ cat, onRename, blockUp }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cat.name);

  const handleRenameClick = () => {
    setIsEditing(true);
    setEditValue(cat.name);
  };

  const submitRename = () => {
    setIsEditing(false);
    if (editValue && editValue.trim() !== cat.name) {
      onRename(editValue.trim());
    }
    setTimeout(() => setFocus(focusKey), 50);
  };

  const { ref, focused, focusKey } = useFocusable({
    focusKey: blockUp ? 'FIRST_FAV_TITLE' : `CAT_TITLE_${cat.id}`,
    onEnterPress: handleRenameClick,
    onArrowPress: (direction) => {
      if (blockUp && direction === 'up') {
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
        setFocus('HEADER_ADD_CAT_BTN');
        return false;
      }
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      return true;
    },
    onFocus: () => {
      lastFocusedFavKey = focusKey;
      (window as any).__lastFocusedFavKey = focusKey;
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') submitRename();
          if (e.key === 'Escape') {
            setIsEditing(false);
            setTimeout(() => setFocus(focusKey), 50);
          }
        }}
        onBlur={submitRename}
        className="text-4xl font-extralight tracking-tight uppercase bg-black/80 border-b-2 border-[#b5924d] outline-none text-white px-4 py-2 -ml-4 rounded-sm shadow-xl z-50 relative"
        style={{ width: `${Math.max(editValue.length + 2, 10)}ch` }}
      />
    );
  }

  return (
    <h2 ref={ref}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      onClick={handleRenameClick}
      className={`text-4xl font-extralight tracking-tight uppercase cursor-pointer px-4 py-2 -ml-4 rounded-sm outline-none
        ${focused ? 'bg-white text-black scale-105 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'hover:text-[#b5924d]'}`}>
      {cat.name}
    </h2>
  );
}

// ─── Utility button ───────────────────────────────────────────────────────────

function FocusableButton({ onClick, icon, label, variant, focusKey: customFocusKey, blockUp, disabled }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusable: !disabled,
    focusKey: customFocusKey,
    onEnterPress: disabled ? undefined : onClick,
    onArrowPress: (direction) => {
      if (blockUp && direction === 'up') {
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
        setFocus('HEADER_ADD_CAT_BTN');
        return false;
      }
      return true;
    },
  });
  return (
    <button ref={ref} onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => { if (isMouseMode && !disabled) setFocus(focusKey); }}
      className={`outline-none transition-all
        ${label ? 'px-4 py-2 rounded-sm' : 'w-10 h-10 flex items-center justify-center border rounded-full'}
        ${disabled
          ? 'opacity-20 cursor-not-allowed text-gray-500 border-white/5'
          : focused
            ? 'bg-white text-black scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)] border-white'
            : variant === 'danger' ? 'text-red-900/40 border-transparent hover:text-red-500 hover:border-red-500/20' : 'text-[#b5924d] border-white/10 hover:border-[#b5924d]/40'}`}>
      {label ? <span className="text-[9px] font-bold uppercase tracking-[0.4em]">{label}</span> : icon}
    </button>
  );
}

// ─── Favorite Card ───────────────────────────────────────────────────────────

const FocusableFavoriteCard = React.memo(function FocusableFavoriteCard({ item, catId, isFirstItem, onPlay, onRemove, onMove }: any) {
  const id = item.series_id || item.seriesId || item.stream_id || item.id;
  const uniqueId = `${catId}_${id}`;
  const isSeries = item.type === 'series' || item.stream_type === 'series' || !!item.series_id || !!item.seriesId || !!item.seasons || !!item.episode_run_time || (typeof window !== 'undefined' && useDataStore.getState().series?.some((s: any) => String(s.series_id || s.id) === String(id)));
  const isChannel = !isSeries && (item.stream_type === 'live' || item.type === 'live' || item.type === 'channel' || item.epg_channel_id !== undefined || item.tv_archive !== undefined || (!item.container_extension && item.type !== 'movie' && item.stream_type !== 'movie' && !(typeof window !== 'undefined' && useDataStore.getState().movies?.some((m: any) => String(m.stream_id || m.id) === String(id)))));
  const [active, setActive] = useState(false);

  const imgKey = isFirstItem ? 'FIRST_FAV_ITEM' : `IMG_${uniqueId}`;

  const { ref: wrapRef, focusKey } = useFocusable({
    focusKey: `CARD_${uniqueId}`,
    preferredChildFocusKey: imgKey,
  });

  const activate = () => setActive(true);
  const deactivate = () => setActive(false);

  useEffect(() => {
    if (!active) return;

    const handleCardKeyDown = (e: KeyboardEvent) => {
      const isBackKey =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'GoBack' ||
        e.key === 'Return' ||
        e.keyCode === 10009 || // Tizen Return
        e.keyCode === 461 ||   // webOS Back
        e.keyCode === 4 ||     // Android Back
        e.which === 10009 ||
        e.which === 461 ||
        e.which === 4;

      if (isBackKey) {
        const activeEl = document.activeElement;
        if (wrapRef.current && activeEl && wrapRef.current.contains(activeEl)) {
          const isActionBtn = activeEl.closest('[data-action-bar]');
          if (isActionBtn) {
            e.stopPropagation();
            e.preventDefault();
            setFocus(imgKey);
            lastFocusedFavKey = imgKey;
          }
        }
      }
    };

    window.addEventListener('keydown', handleCardKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleCardKeyDown, { capture: true });
  }, [active, imgKey]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={wrapRef}
        onMouseEnter={(e: any) => {
          if (lastMouseX !== e.clientX || lastMouseY !== e.clientY) {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            (window as any).isMouseFocus = true;
            activate();
            setFocus(imgKey);
            setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
          }
        }}
        onMouseLeave={() => deactivate()}
        className={`flex flex-col rounded-sm border-4
          ${active
            ? 'border-[#b5924d] scale-105 z-50 shadow-[0_0_50px_rgba(181,146,77,0.5)]'
            : 'border-transparent'}`}
      >
        <div className={`relative overflow-hidden bg-black ring-1 ring-white/10 rounded-sm ${isChannel ? 'aspect-square' : 'aspect-[3/4.5]'}`}>
          <FocusableCardImage
            id={id} item={item} isChannel={isChannel}
            onClick={() => {
              lastFocusedFavKey = imgKey;
              (window as any).__lastFavClickedItem = imgKey;
              try {
                sessionStorage.setItem('fav_clicked_key', imgKey);
              } catch (e) {}
              onPlay(item);
            }}
            onFocus={activate}
            onBlur={deactivate}
            customFocusKey={imgKey}
          />
        </div>

        <div 
          data-action-bar="true"
          className={`flex items-center justify-around bg-black/95 backdrop-blur-xl border-t overflow-hidden ${active ? 'border-[#b5924d]/30' : 'pointer-events-none border-transparent'}`}
          style={{
             maxHeight: active ? '80px' : '0px',
             opacity: active ? 1 : 0,
             paddingTop: active ? '0.75rem' : '0px',
             paddingBottom: active ? '0.75rem' : '0px',
             paddingLeft: '0.75rem',
             paddingRight: '0.75rem'
          }}
        >
          <ActionBtn focusable={active} focusKey={`MOVE_L_${uniqueId}`} onClick={() => onMove(catId, id, 'left')} onFocus={activate} onBlur={deactivate}
            exitLeftToSidebar
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>} />
          <ActionBtn focusable={active} focusKey={`DEL_${uniqueId}`} danger onClick={() => onRemove(catId, id)} onFocus={activate} onBlur={deactivate}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>} />
          <ActionBtn focusable={active} focusKey={`MOVE_R_${uniqueId}`} onClick={() => onMove(catId, id, 'right')} onFocus={activate} onBlur={deactivate}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>} />
        </div>
      </div>
    </FocusContext.Provider>
  );
});

// ─── Card image ───────────────────────────────────────────────────────────────

const FocusableCardImage = React.memo(function FocusableCardImage({ id, item, isChannel, onClick, onFocus, onBlur, customFocusKey }: any) {
  const rating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(item.stream_id || item.series_id || item.id)]?.rating;
  });

  const { ref, focusKey } = useFocusable({
    focusKey: customFocusKey || `IMG_${id}`,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        const grid = ref.current?.closest('.grid');
        if (grid && ref.current) {
          const gridLeft = grid.getBoundingClientRect().left;
          const cardLeft = ref.current.getBoundingClientRect().left;
          if (cardLeft - gridLeft < 60) {
            setFocus('NAV_FAVORITES');
            return false;
          }
        } else if (ref.current && ref.current.getBoundingClientRect().left <= 500) {
          setFocus('NAV_FAVORITES');
          return false;
        }
      }
      return true;
    },
    onFocus: () => {
      lastFocusedFavKey = focusKey;
      (window as any).__lastFocusedFavKey = focusKey;
      onFocus();
      if (!(window as any).isMouseFocus && ref.current) {
        ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    },
    onBlur,
  });

  return (
    <div ref={ref} 
      onClick={() => {
        lastFocusedFavKey = focusKey;
        (window as any).__lastFavClickedItem = focusKey;
        try {
          sessionStorage.setItem('fav_clicked_key', focusKey);
        } catch (e) {}
        onClick();
      }}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className="w-full h-full relative cursor-pointer">
      <img
        loading="lazy"
        decoding="async"
        src={item.stream_icon || item.cover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"}
        onError={(e) => {
          const fallback = isChannel
            ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23b5924d'%3ETV%3C/text%3E%3C/svg%3E"
            : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
          if (e.currentTarget.src !== fallback) { e.currentTarget.src = fallback; }
        }}
        alt={item.name}
        className={`w-full h-full ${isChannel ? 'object-contain p-10' : 'object-cover'}`}
      />
      {isChannel && (
        <div className="absolute top-2 left-2 bg-[#b5924d] text-[7px] font-bold px-2 py-1 tracking-widest text-black uppercase z-20 shadow-lg">LIVE</div>
      )}

      {rating && !isChannel && (
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-[#b5924d]/30 px-3 py-1.5 rounded-full flex items-center space-x-1.5 z-20 shadow-lg">
          <span className="text-[10px] text-[#b5924d]">★</span>
          <span className="text-[9px] font-black text-white tracking-widest">{rating}/10</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <p className="text-[10px] font-bold text-white line-clamp-3 leading-tight uppercase tracking-[0.15em]">{item.name}</p>
      </div>
    </div>
  );
});

// ─── Action button ────────────────────────────────────────────────────────────

const ActionBtn = React.memo(function ActionBtn({ focusKey: fk, onClick, icon, danger, onFocus, onBlur, exitLeftToSidebar, focusable = true }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusable,
    focusKey: fk,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (exitLeftToSidebar && direction === 'left') {
        const grid = ref.current?.closest('.grid');
        if (grid && ref.current) {
          const gridLeft = grid.getBoundingClientRect().left;
          const btnLeft = ref.current.getBoundingClientRect().left;
          if (btnLeft - gridLeft < 100) {
            setFocus('NAV_FAVORITES');
            return false;
          }
        } else {
          setFocus('NAV_FAVORITES');
          return false;
        }
      }
      return true;
    },
    onFocus,
    onBlur,
  });

  return (
    <button ref={ref} onClick={onClick}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`w-11 h-11 flex items-center justify-center rounded-full
        ${focused
          ? 'bg-[#b5924d] text-black scale-125 shadow-[0_0_20px_rgba(181,146,77,0.6)]'
          : danger ? 'text-red-400 bg-red-500/10' : 'text-white/60 bg-white/5'}`}>
      {icon}
    </button>
  );
});

// ─── Sort dropdown ────────────────────────────────────────────────────────────

function SortDropdown({ catId, currentSort, setSortOrder, blockUp }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { value: 'default', label: 'Défaut' },
    { value: 'date_desc', label: 'Plus Récents' },
    { value: 'date_asc', label: 'Plus Anciens' },
    { value: 'alpha_asc', label: 'A à Z' },
    { value: 'alpha_desc', label: 'Z à A' },
    { value: 'rating_desc', label: 'Mieux Notés' },
    { value: 'rating_asc', label: 'Moins Bien Notés' },
  ];
  const currentLabel = options.find(o => o.value === (currentSort || 'default'))?.label || 'Défaut';

  const { ref, focused, focusKey } = useFocusable({
    onEnterPress: () => {
      setIsOpen(!isOpen);
      if (!isOpen) {
        const currentIndex = options.findIndex(o => o.value === (currentSort || 'default'));
        const indexToFocus = currentIndex >= 0 ? currentIndex : 0;
        setTimeout(() => setFocus(`SORT_OPT_${catId}_${indexToFocus}`), 50);
      }
    },
    onArrowPress: (direction) => {
      if (blockUp && direction === 'up') {
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
        setFocus('HEADER_ADD_CAT_BTN');
        return false;
      }
      return true;
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        setIsOpen(false);
        setFocus(focusKey);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusKey]);

  return (
    <div className="relative z-50">
      <button ref={ref} onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
        className={`px-4 py-2 text-[9px] font-bold uppercase tracking-[0.3em] rounded-sm transition-all outline-none mr-4 flex items-center space-x-2
          ${focused || isOpen
            ? 'bg-white text-black scale-105 shadow-[0_0_20px_rgba(255,255,255,0.4)] border border-white'
            : 'text-[#b5924d] border border-white/10'}`}>
        <span>Tri: {currentLabel}</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-4 mt-2 bg-black/95 backdrop-blur-xl border border-[#b5924d]/30 rounded-sm shadow-2xl flex flex-col p-2 min-w-[160px] animate-in fade-in zoom-in-95 duration-200">
          {options.map((opt, index) => (
            <SortOption
              key={opt.value}
              opt={opt}
              catId={catId}
              index={index}
              totalOptions={options.length}
              currentSort={currentSort}
              closeMenu={() => {
                setIsOpen(false);
                setTimeout(() => setFocus(focusKey), 50);
              }}
              onSelect={() => {
                setSortOrder(catId, opt.value);
                setIsOpen(false);
                setTimeout(() => setFocus(focusKey), 50);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortOption({ opt, currentSort, onSelect, catId, index, totalOptions, closeMenu, blockUp, cat }: any) {
  const isActive = currentSort === opt.value || (!currentSort && opt.value === 'default');
  const { ref, focused, focusKey } = useFocusable({
    focusKey: `SORT_OPT_${catId}_${index}`,
    onEnterPress: onSelect,
    onArrowPress: (direction) => {
      if (direction === 'left' || direction === 'right') {
        closeMenu();
        return false;
      }
      if (direction === 'up') {
        if (index === 0) closeMenu();
        else setFocus(`SORT_OPT_${catId}_${index - 1}`);
        return false;
      }
      if (direction === 'down') {
        if (index === totalOptions - 1) closeMenu();
        else setFocus(`SORT_OPT_${catId}_${index + 1}`);
        return false;
      }
      return true;
    }
  });

  return (
    <button ref={ref} onClick={onSelect}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest rounded-sm transition-colors outline-none flex items-center justify-between
        ${focused ? 'bg-white text-black' : isActive ? 'text-[#b5924d] bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
      <span>{opt.label}</span>
      {isActive && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
    </button>
  );
}