import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useRatingStore } from '../store/useRatingStore';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

interface RatingModalProps {
  item: any;
  onClose: () => void;
}

export default function RatingModal({ item, onClose }: RatingModalProps) {
  const { setRating, getRating, removeRating } = useRatingStore();
  const streamId = item.stream_id || item.series_id || item.id;
  const existingRating = getRating(streamId);
  const initialRating = existingRating || 5; // Default to 5 if not rated
  const hasExistingRating = existingRating !== null;
  const [currentRating, setCurrentRating] = useState(initialRating);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [hasReleased, setHasReleased] = useState(false);

  const { ref, focusKey } = useFocusable({
    focusKey: 'RATING_MODAL',
    isFocusBoundary: true,
    autoRestoreFocus: true
  });

  useEffect(() => {
    setPortalNode(document.body);
    
    const timer = setTimeout(() => {
        setFocus(`RATING_BTN_${initialRating}`);
    }, 100);

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
  }, [initialRating]);

  const handleSave = (val: number, isKeyboard = false) => {
    if (isKeyboard && !hasReleased) return;
    setRating(streamId, val);
    onClose();
  };

  const handleDelete = (isKeyboard = false) => {
    if (isKeyboard && !hasReleased) return;
    removeRating(streamId);
    onClose();
  };

  if (!portalNode) return null;
  
  const modalContent = (
    <FocusContext.Provider value={focusKey}>
      <div 
        ref={ref}
        role="dialog"
        onClick={(e) => e.stopPropagation()} 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300"
      >
        <div className="bg-[#080808] w-full max-w-2xl rounded-[40px] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-10 border-b border-white/5 flex justify-between items-center bg-gradient-to-b from-white/[0.02] to-transparent">
              <div>
                  <h3 className="text-3xl font-black tracking-tight text-white mb-1 uppercase">Noter cette œuvre</h3>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#b5924d] font-black">{item.name || item.title || 'Sans titre'}</p>
              </div>
              <FocusableSimpleButton focusKey="MODAL_CLOSE_BTN" onClick={(isKeyboard: boolean) => { if (isKeyboard && !hasReleased) return; onClose(); }} className="p-4 bg-white/5 rounded-full text-gray-500 hover:text-white transition-all font-black text-xl">✕</FocusableSimpleButton>
          </div>

          <div className="p-12 text-center">
             <div className="text-7xl font-black text-white mb-8 drop-shadow-2xl">{currentRating} <span className="text-3xl text-white/30">/ 10</span></div>
             
             <div className="flex justify-center items-center space-x-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                    <FocusableRatingButton 
                        key={val}
                        val={val}
                        customFocusKey={`RATING_BTN_${val}`}
                        onFocus={() => setCurrentRating(val)}
                        onClick={(isKeyboard: boolean) => handleSave(val, isKeyboard)}
                        isSelected={val === initialRating}
                    />
                ))}
             </div>
          </div>
          
          <div className="p-6 bg-[#121212] border-t border-white/5 flex justify-center space-x-4">
             <FocusableSimpleButton onClick={(isKeyboard: boolean) => handleSave(currentRating, isKeyboard)} className="bg-[#b5924d] text-black px-12 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-colors shadow-[0_0_30px_rgba(181,146,77,0.3)]">
                 Valider la note ({currentRating}/10)
             </FocusableSimpleButton>

             {hasExistingRating && (
                 <FocusableSimpleButton onClick={(isKeyboard: boolean) => handleDelete(isKeyboard)} className="bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/20 px-8 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-colors">
                     Supprimer
                 </FocusableSimpleButton>
             )}
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );

  return ReactDOM.createPortal(modalContent, portalNode);
}

function FocusableRatingButton({ val, onClick, onFocus, customFocusKey, isSelected }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: () => onClick(true),
    onFocus: onFocus
  });

  return (
    <button 
      ref={ref}
      onClick={() => onClick(false)}
      onMouseEnter={() => {
        setFocus(focusKey);
        onFocus();
      }}
      className={`w-12 h-16 rounded-xl border flex items-center justify-center transition-all duration-300 font-bold text-lg
                 ${focused ? 'bg-white text-black border-white scale-125 z-10 shadow-2xl' : 
                   isSelected ? 'bg-[#b5924d]/20 text-[#b5924d] border-[#b5924d]/50' : 'bg-white/5 text-gray-500 border-transparent'}`}
    >
      {val}
    </button>
  );
}

function FocusableSimpleButton({ children, onClick, className, focusKey: customFocusKey }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: () => onClick(true)
  });

  return (
    <button 
      ref={ref}
      onClick={() => onClick(false)}
      onMouseEnter={() => setFocus(focusKey)}
      className={`${className} ${focused ? 'bg-white text-black scale-105 border-white shadow-[0_0_40px_rgba(255,255,255,0.4)]' : ''}`}
    >
      {children}
    </button>
  );
}
