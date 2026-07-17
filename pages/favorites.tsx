import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useDataStore } from '../store/useDataStore';
import { useProfileStore } from '../store/useProfileStore';
import { useRatingStore } from '../store/useRatingStore';
import { Sidebar } from '../components/Sidebar';
import { xtreamApi } from '../utils/xtream';
import { ResumeModal } from '../components/ResumeModal';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

// ─── Global mouse / key mode tracker ─────────────────────────────────────────
let lastMouseX = -1;
let lastMouseY = -1;
let isMouseMode = false;

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
  const { getProfileData, removeCategory, removeItemFromCategory, moveCategory, moveItemInCategory } = useDataStore();
  const { favoriteCategories } = getProfileData();
  const [mounted, setMounted] = useState(false);
  const [launchingVideo, setLaunchingVideo] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean; item: any; time: number }>({
    isOpen: false, item: null, time: 0,
  });

  const { ref, focusKey } = useFocusable({
    focusKey: 'MAIN_CONTENT',
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
  }, []);

  useEffect(() => {
    if (mounted) setTimeout(() => setFocus('FIRST_FAV_ITEM'), 400);
  }, [mounted]);

  if (!mounted) return null;

  const handlePlay = (item: any, forcedStartTime?: number) => {
    if (launchingVideo) return;
    const id = item.stream_id || item.series_id || item.id;
    const type = item.stream_type || (item.series_id ? 'series' : 'movie');
    const ext = item.container_extension || (type === 'live' ? 'ts' : 'm3u8');

    if (item.isLocal) {
      if (item.type === 'series') router.push(`/series/local-${id}`);
      else router.push(`/player/local-${id}?type=movie&title=${encodeURIComponent(item.name)}&localPath=${encodeURIComponent(item.episodes?.[0]?.path)}`);
      return;
    }

    if (type === 'series') { router.push(`/series/${id}`); return; }

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
        <main ref={ref} className="ml-20 lg:ml-72 flex-1 relative overflow-y-auto no-scrollbar pb-40">

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

          <header className="relative z-10 pt-32 pb-24 px-20">
            <div className="flex items-center space-x-6 mb-12">
              <div className="w-16 h-[1px] bg-[#b5924d]/40" />
              <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Archives Personnelles</span>
            </div>
            <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-tight text-white">
              MES <span className="opacity-30 italic font-serif text-white/50">COLLECTIONS.</span>
            </h1>
          </header>

          <div className="px-20 relative z-10 space-y-40 pb-40">
            {favoriteCategories.length === 0 ? (
              <div className="py-24 text-center border border-white/5 rounded-sm bg-white/[0.01]">
                <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.4em]">Aucun Registre Indexé</p>
              </div>
            ) : (
              favoriteCategories.map((cat, catIdx) => (
                <FocusableCategory
                  key={cat.id} cat={cat} catIdx={catIdx}
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

// ─── Category ────────────────────────────────────────────────────────────────

function FocusableCategory({ cat, catIdx, moveCategory, removeCategory, moveItemInCategory, removeItemFromCategory, handlePlay }: any) {
  const { ref, focusKey } = useFocusable();
  const setCategorySortOrder = useDataStore(state => state.setCategorySortOrder);
  const renameCategory = useDataStore(state => state.renameCategory);
  const profileId = useProfileStore.getState().activeProfile?.id || 'default';
  const ratings = useRatingStore(state => state.ratings[profileId]) || {};
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sortedItems = useMemo(() => {
    const sortOrder = cat.sortOrder || 'default';
    let items = [...cat.items];

    const extractDateFromTitle = (title: string) => {
      if (!title) return 0;
      // YYYY-MM-DD or YYYY.MM.DD
      let match = title.match(/(\d{4})[-\.](\d{2})[-\.](\d{2})/);
      if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();

      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      match = title.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
      if (match) return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1])).getTime();

      // DD/MM/YY
      match = title.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})/);
      if (match) {
        let year = parseInt(match[3]);
        year += year > 50 ? 1900 : 2000;
        return new Date(year, parseInt(match[2]) - 1, parseInt(match[1])).getTime();
      }

      // Année seule (ex: 2024)
      const yearMatches = title.match(/\b(19\d{2}|20\d{2})\b/g);
      if (yearMatches) {
        const lastYear = yearMatches[yearMatches.length - 1]; // Prend la dernière année mentionnée
        return new Date(parseInt(lastYear), 0, 1).getTime();
      }

      return 0;
    };

    if (sortOrder === 'date_desc' || sortOrder === 'date') {
      items.sort((a, b) => {
        const dateA = extractDateFromTitle(a.name) || a._addedAt || 0;
        const dateB = extractDateFromTitle(b.name) || b._addedAt || 0;
        return dateB - dateA;
      });
    } else if (sortOrder === 'date_asc') {
      items.sort((a, b) => {
        const dateA = extractDateFromTitle(a.name) || a._addedAt || 0;
        const dateB = extractDateFromTitle(b.name) || b._addedAt || 0;
        return dateA - dateB;
      });
    } else if (sortOrder === 'alpha_asc') {
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'alpha_desc') {
      items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortOrder === 'rating_desc' || sortOrder === 'rating') {
      items.sort((a, b) => {
        const rA = ratings[String(a.stream_id || a.series_id || a.id)]?.rating || 0;
        const rB = ratings[String(b.stream_id || b.series_id || b.id)]?.rating || 0;
        return rB - rA; // desc, unrated at bottom
      });
    } else if (sortOrder === 'rating_asc') {
      items.sort((a, b) => {
        const rA = ratings[String(a.stream_id || a.series_id || a.id)]?.rating || 0;
        const rB = ratings[String(b.stream_id || b.series_id || b.id)]?.rating || 0;
        // If unrated is 0, sorting asc will put unrated at the top. This is usually expected.
        return rA - rB;
      });
    }
    return items;
  }, [cat.items, cat.sortOrder, ratings]);

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
                onClick={() => moveCategory(cat.id, 'up')}
                icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>} />
              <FocusableButton
                blockUp={catIdx === 0}
                onClick={() => moveCategory(cat.id, 'down')}
                icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>} />
            </div>
          </div>
          {confirmDelete ? (
            <div className="flex space-x-2 animate-in fade-in zoom-in duration-200">
              <FocusableButton
                blockUp={catIdx === 0}
                onClick={() => removeCategory(cat.id)}
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
                onRemove={removeItemFromCategory} onMove={moveItemInCategory}
                isFirstItem={catIdx === 0 && idx === 0}
              />
            ))
          )}
        </div>
      </section>
    </FocusContext.Provider>
  );
}

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
    onEnterPress: handleRenameClick,
    onArrowPress: (direction) => {
      if (blockUp && direction === 'up') return false;
      // The category title sits at the far-left edge of the row: the spatial
      // navigation algorithm has nothing to its left inside MAIN_CONTENT, so
      // returning `true` here (asking the parent to handle it) silently drops
      // focus instead of bubbling to the sidebar. Handle it explicitly.
      if (direction === 'left') {
        setFocus('NAV_FAVORITES');
        return false;
      }
      return true;
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
      className={`text-4xl font-extralight tracking-tight uppercase cursor-pointer px-4 py-2 -ml-4 rounded-sm transition-all outline-none
        ${focused ? 'bg-white text-black scale-105 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'hover:text-[#b5924d]'}`}>
      {cat.name}
    </h2>
  );
}

// ─── Utility button ───────────────────────────────────────────────────────────

function FocusableButton({ onClick, icon, label, variant, focusKey: customFocusKey, blockUp }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (blockUp && direction === 'up') return false;
      return true;
    },
  });
  return (
    <button ref={ref} onClick={onClick}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`transition-all duration-300 outline-none
        ${label ? 'px-4 py-2 rounded-sm' : 'w-10 h-10 flex items-center justify-center border rounded-full'}
        ${focused
          ? 'bg-white text-black scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)] border-white'
          : variant === 'danger' ? 'text-red-900/40 border-transparent' : 'text-[#b5924d] border-white/10'}`}>
      {label ? <span className="text-[9px] font-bold uppercase tracking-[0.4em]">{label}</span> : icon}
    </button>
  );
}

// ─── Favorite Card ───────────────────────────────────────────────────────────
// ARCHITECTURE:
//   - The wrapper has useFocusable to anchor the FocusContext for children.
//   - Visual state (border + overlay) is driven by local `active` state.
//   - `active` is set to true by children's onFocus callbacks (setState only, never setFocus).
//   - `active` is set to false by children's onBlur callbacks.
//   - Mouse enter/leave on the wrapper also sets `active` + calls setFocus on the image.

function FocusableFavoriteCard({ item, catId, isFirstItem, onPlay, onRemove, onMove }: any) {
  const id = item.stream_id || item.series_id || item.id;
  const isChannel = item.stream_type === 'live' || (!item.series_id && !item.container_extension && item.type !== 'series' && item.type !== 'movie');
  const [active, setActive] = useState(false);
  const hoverTimeout = React.useRef<any>(null);

  const imgKey = isFirstItem ? 'FIRST_FAV_ITEM' : `IMG_${id}`;

  // Wrapper gives us the focusKey context for children — but we DON'T use its `focused`
  // because the actual spatial focus lands on IMG_${id}, not on CARD_${id}.
  const { ref: wrapRef, focusKey } = useFocusable({
    focusKey: `CARD_${id}`,
    preferredChildFocusKey: imgKey,
  });

  const activate = () => setActive(true);
  const deactivate = () => setActive(false);

  return (
    <FocusContext.Provider value={focusKey}>
      {/* Outer wrapper: flex-col so image + buttons stack vertically */}
      <div
        ref={wrapRef}
        onMouseEnter={(e: any) => {
          if (lastMouseX !== e.clientX || lastMouseY !== e.clientY) {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            (window as any).isMouseFocus = true;
            activate();
            setFocus(`IMG_${id}`);
            setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
          }
        }}
        onMouseLeave={() => deactivate()}
        className={`flex flex-col rounded-sm transition-all duration-300 border-4
          ${active
            ? 'border-[#b5924d] scale-105 z-50 shadow-[0_0_50px_rgba(181,146,77,0.5)]'
            : 'border-transparent'}`}
      >
        {/* Image fills the aspect ratio */}
        <div className={`relative overflow-hidden bg-black ring-1 ring-white/10 rounded-sm ${isChannel ? 'aspect-square' : 'aspect-[3/4.5]'}`}>
          <FocusableCardImage
            id={id} item={item} isChannel={isChannel}
            onClick={() => onPlay(item)}
            onFocus={activate}
            onBlur={deactivate}
            customFocusKey={imgKey}
          />
        </div>

        {/* Action bar — asymmetric transitions: opens smoothly, closes visually instantly but delays layout collapse to prevent grid bouncing */}
        <div 
          className={`flex items-center justify-around bg-black/95 backdrop-blur-xl border-t overflow-hidden ${active ? 'border-[#b5924d]/30' : 'pointer-events-none border-transparent'}`}
          style={{
             maxHeight: active ? '80px' : '0px',
             opacity: active ? 1 : 0,
             paddingTop: active ? '0.75rem' : '0px',
             paddingBottom: active ? '0.75rem' : '0px',
             paddingLeft: '0.75rem',
             paddingRight: '0.75rem',
             transition: active 
               ? 'max-height 200ms ease-out 0s, opacity 200ms ease-out 0s, padding 200ms ease-out 0s' 
               : 'opacity 0s linear 0s, max-height 300ms ease-in 400ms, padding 300ms ease-in 400ms'
          }}
        >
          <ActionBtn focusable={active} focusKey={`MOVE_L_${id}`} onClick={() => onMove(catId, id, 'left')} onFocus={activate} onBlur={deactivate}
            exitLeftToSidebar
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>} />
          <ActionBtn focusable={active} focusKey={`DEL_${id}`} danger onClick={() => onRemove(catId, id)} onFocus={activate} onBlur={deactivate}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>} />
          <ActionBtn focusable={active} focusKey={`MOVE_R_${id}`} onClick={() => onMove(catId, id, 'right')} onFocus={activate} onBlur={deactivate}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>} />
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ─── Card image ───────────────────────────────────────────────────────────────

function FocusableCardImage({ id, item, isChannel, onClick, onFocus, onBlur, customFocusKey }: any) {
  const rating = useRatingStore(state => {
    const profileId = useProfileStore.getState().activeProfile?.id || 'default';
    return state.ratings[profileId]?.[String(item.stream_id || item.series_id || item.id)]?.rating;
  });

  const { ref, focusKey } = useFocusable({
    focusKey: customFocusKey || `IMG_${id}`,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_FAVORITES');
          return false;
        }
      }
      return true;
    },
    // Only setState — never call setFocus here to avoid loops
    onFocus: () => {
      onFocus();
      if (!(window as any).isMouseFocus && ref.current) {
        ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    },
    onBlur,
  });

  return (
    <div ref={ref} onClick={onClick}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className="w-full h-full relative cursor-pointer">
      <img
        src={item.stream_icon || item.cover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E"}
        onError={(e) => {
          const fallback = isChannel
            ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23b5924d'%3ETV%3C/text%3E%3C/svg%3E"
            : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
          if (e.currentTarget.src !== fallback) { e.currentTarget.src = fallback; }
        }}
        alt={item.name}
        className={`w-full h-full transition-transform duration-500 ${isChannel ? 'object-contain p-10' : 'object-cover'}`}
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
        <p className="text-[10px] font-bold text-white truncate uppercase tracking-[0.15em]">{item.name}</p>
      </div>
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ focusKey: fk, onClick, icon, danger, onFocus, onBlur, exitLeftToSidebar, focusable = true }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusable,
    focusKey: fk,
    onEnterPress: onClick,
    onArrowPress: (direction) => {
      // This button sits at the left edge of the action bar (closest to the
      // sidebar). Just like the category title and the card image, relying on
      // bubbling through the nested FocusContext.Providers (CARD_ -> section ->
      // MAIN_CONTENT) drops focus instead of reaching MAIN_CONTENT's handler.
      // Hand off explicitly instead.
      if (exitLeftToSidebar && direction === 'left') {
        if (ref.current && ref.current.getBoundingClientRect().left <= 400) {
          setFocus('NAV_FAVORITES');
          return false;
        }
      }
      return true;
    },
    // Only setState — never call setFocus here to avoid loops
    onFocus,
    onBlur,
  });

  return (
    <button ref={ref} onClick={onClick}
      onMouseEnter={() => { if (isMouseMode) setFocus(focusKey); }}
      className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-200
        ${focused
          ? 'bg-[#b5924d] text-black scale-125 shadow-[0_0_20px_rgba(181,146,77,0.6)]'
          : danger ? 'text-red-400 bg-red-500/10' : 'text-white/60 bg-white/5'}`}>
      {icon}
    </button>
  );
}

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
      if (blockUp && direction === 'up') return false;
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

function SortOption({ opt, currentSort, onSelect, catId, index, totalOptions, closeMenu }: any) {
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