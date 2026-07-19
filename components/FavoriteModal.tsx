import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDataStore } from '../store/useDataStore';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import RatingModal from './RatingModal';

interface FavoriteModalProps {
  item: any;
  onClose: () => void;
}

export default function FavoriteModal({ item, onClose }: FavoriteModalProps) {
  const { addItemToCategory, addCategory, getProfileData } = useDataStore();
  const { favoriteCategories } = getProfileData();
  const [newCatName, setNewCatName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [hasReleased, setHasReleased] = useState(false);

  const { ref, focusKey } = useFocusable({
    focusKey: 'FAVORITE_MODAL',
    isFocusBoundary: true,
    autoRestoreFocus: true
  });

  useEffect(() => {
    setPortalNode(document.body);
    
    // Safety: only focus after a short delay
    const timer = setTimeout(() => {
        setFocus('MODAL_CLOSE_BTN');
    }, 100);

    // Global listener to detect when the user FINALLY lets go of the Enter key
    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        setHasReleased(true);
      }
    };
    
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keyup', handleGlobalKeyUp);
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keyup', handleGlobalKeyUp);
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, []);

  const handleAdd = (catId: string, isKeyboard = false) => {
    if (isKeyboard && !hasReleased) return;
    addItemToCategory(catId, item);
    onClose();
  };

  const handleCreate = (isKeyboard = false) => {
    if (isKeyboard && !hasReleased) return;
    if (newCatName.trim()) {
      addCategory(newCatName.trim());
      setNewCatName('');
      setShowAdd(false);
    }
  };

  if (!portalNode) return null;
  
  if (showRating) {
    return <RatingModal item={item} onClose={onClose} />;
  }

  const modalContent = (
    <FocusContext.Provider value={focusKey}>
      <div 
        ref={ref}
        role="dialog"
        onClick={(e) => e.stopPropagation()} 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300"
      >
        <div className="bg-[#1a1a1a] w-full max-w-md rounded-[40px] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-10 border-b border-white/5 flex justify-between items-center bg-gradient-to-b from-white/[0.02] to-transparent">
              <div>
                  <h3 className="text-2xl font-black tracking-tight text-white mb-1 uppercase">Ranger dans...</h3>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#b5924d] font-black">Médiathèque Personnelle</p>
              </div>
              <FocusableSimpleButton focusKey="MODAL_CLOSE_BTN" onClick={(isKeyboard: boolean) => { if (isKeyboard && !hasReleased) return; onClose(); }} className="p-3 bg-white/5 rounded-full text-gray-500 hover:text-white transition-all font-black">✕</FocusableSimpleButton>
          </div>

          <div className="p-6 max-h-[400px] overflow-y-auto space-y-3 custom-scrollbar">
              {favoriteCategories.map((cat, idx) => {
                  const itemId = item.stream_id || item.series_id || item.id;
                  const strId = String(itemId);
                  const isAlreadyInCat = cat.items.some((i: any) => String(i.stream_id || i.series_id || i.id) === strId);

                  return (
                      <FocusableCategoryItem 
                          key={cat.id}
                          cat={cat}
                          isAlreadyInCat={isAlreadyInCat}
                          onClick={(isKeyboard: boolean) => handleAdd(cat.id, isKeyboard)}
                          customFocusKey={`CAT_${cat.id}`}
                          isLast={idx === favoriteCategories.length - 1}
                          showRatingBtn={!(item.stream_type === 'live' || item.type === 'live' || (!item.series_id && !item.container_extension && item.type !== 'series' && item.type !== 'movie'))}
                      />
                  );
              })}
          </div>

          <div className="p-10 bg-[#121212] border-t border-white/5 space-y-4">
              {!showAdd ? (
                  <>
                      {/* On masque le bouton de notation si c'est une chaîne en direct */}
                      {!(item.stream_type === 'live' || item.type === 'live' || (!item.series_id && !item.container_extension && item.type !== 'series' && item.type !== 'movie')) && (
                          <FocusableSimpleButton 
                              focusKey="RATE_BTN"
                              onArrowPress={(dir: string) => {
                                 if (dir === 'up' && favoriteCategories.length > 0) {
                                    setFocus(`CAT_${favoriteCategories[favoriteCategories.length - 1].id}`);
                                    return false;
                                 }
                                 if (dir === 'down') {
                                    setFocus('NEW_CAT_BTN');
                                    return false;
                                 }
                                 return true;
                              }}
                              onClick={(isKeyboard: boolean) => {
                                  if (isKeyboard && !hasReleased) return;
                                  setShowRating(true);
                              }}
                              className="w-full py-5 rounded-2xl bg-[#b5924d]/10 hover:bg-[#b5924d]/20 border border-[#b5924d]/20 text-[#b5924d] transition-all font-black text-[10px] uppercase tracking-[0.2em]"
                          >
                              ⭐ Noter l'œuvre
                          </FocusableSimpleButton>
                      )}
                      <FocusableSimpleButton 
                          focusKey="NEW_CAT_BTN"
                          onArrowPress={(dir: string) => {
                             if (dir === 'up') {
                                const showRate = !(item.stream_type === 'live' || item.type === 'live' || (!item.series_id && !item.container_extension && item.type !== 'series' && item.type !== 'movie'));
                                if (showRate) {
                                   setFocus('RATE_BTN');
                                } else if (favoriteCategories.length > 0) {
                                   setFocus(`CAT_${favoriteCategories[favoriteCategories.length - 1].id}`);
                                }
                                return false;
                             }
                             return true;
                          }}
                          onClick={() => setShowAdd(true)}
                          className="w-full py-5 rounded-2xl border-2 border-dashed border-white/10 text-gray-500 transition-all font-black text-[10px] uppercase tracking-[0.2em]"
                      >
                          + Nouvelle Section
                      </FocusableSimpleButton>
                  </>
              ) : (
                  <div className="flex flex-col space-y-4">
                      <input 
                          autoFocus
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                              e.stopPropagation();
                            }
                            if (e.key === 'Enter') {
                              handleCreate(true);
                            }
                            if (e.key === 'Escape') {
                              setShowAdd(false);
                            }
                          }}
                          placeholder="NOM DU DOSSIER (EX: FOOT...)"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-[#b5924d] placeholder:text-gray-700"
                      />
                      <div className="flex space-x-3">
                          <FocusableSimpleButton onClick={(isKeyboard: boolean) => handleCreate(isKeyboard)} className="flex-1 bg-[#b5924d] text-black py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors">Créer le dossier</FocusableSimpleButton>
                          <FocusableSimpleButton onClick={() => setShowAdd(false)} className="px-6 bg-white/5 text-gray-500 rounded-xl transition-colors font-bold uppercase text-[10px]">Annuler</FocusableSimpleButton>
                      </div>
                  </div>
              )}
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );

  return ReactDOM.createPortal(modalContent, portalNode);
}

function FocusableCategoryItem({ cat, onClick, customFocusKey, isLast, showRatingBtn, isAlreadyInCat }: any) {
  const { ref, focused } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: () => onClick(true),
    onArrowPress: (dir) => {
      if (dir === 'down' && isLast) {
        setFocus(showRatingBtn ? 'RATE_BTN' : 'NEW_CAT_BTN');
        return false;
      }
      return true;
    },
    onFocus: () => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  return (
    <button 
        ref={ref}
        onClick={() => onClick(false)}
        className={`w-full flex items-center justify-between p-6 rounded-[24px] transition-all group text-left border 
                   ${focused ? 'bg-[#b5924d] border-[#b5924d] scale-102 shadow-xl' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
    >
        <div className="flex items-center space-x-5">
            <span className={`text-3xl transition-transform flex items-center justify-center w-12 h-12 rounded-2xl ${focused ? 'bg-black/20' : 'bg-black/20'}`}>📁</span>
            <div>
                <span className={`font-black text-sm uppercase tracking-tight flex items-center gap-2 ${focused ? 'text-black' : 'text-white'}`}>
                    <span className="truncate max-w-[150px] block">{cat.name}</span>
                    {isAlreadyInCat && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-sm tracking-widest ${focused ? 'bg-black/10 text-black' : 'bg-[#b5924d]/20 text-[#b5924d]'}`}>
                            AJOUTÉ
                        </span>
                    )}
                </span>
                <span className={`text-[10px] font-bold tracking-wider ${focused ? 'text-black/60' : 'text-gray-500'}`}>SECTION</span>
            </div>
        </div>
        <div className={`${focused ? 'bg-black/10 text-black' : 'bg-white/5 text-white/40'} px-4 py-2 rounded-full`}>
            <span className="text-[10px] font-black">{cat.items.length} contenus</span>
        </div>
    </button>
  );
}

function FocusableSimpleButton({ children, onClick, className, focusKey: customFocusKey, onArrowPress }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onArrowPress,
    onEnterPress: () => onClick(true)
  });

  return (
    <button 
      ref={ref}
      onClick={() => onClick(false)}
      onMouseEnter={() => setFocus(focusKey)}
      className={`${className} ${focused ? 'bg-white text-black scale-105 border-white' : ''}`}
    >
      {children}
    </button>
  );
}
