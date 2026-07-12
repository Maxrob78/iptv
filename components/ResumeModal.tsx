import React, { useEffect } from 'react';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onStartOver: () => void;
  title: string;
  time: number;
}

export const ResumeModal: React.FC<ResumeModalProps> = ({ isOpen, onClose, onConfirm, onStartOver, title, time }) => {
  const { ref, focusKey } = useFocusable({
    focusKey: 'RESUME_MODAL',
    isFocusBoundary: true
  });

  useEffect(() => {
    if (isOpen) {
      // Un petit délai pour laisser le temps au DOM de s'afficher
      setTimeout(() => {
        setFocus('RESUME_CONFIRM');
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <FocusContext.Provider value={focusKey}>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div ref={ref} className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-sm shadow-[0_50px_100px_rgba(0,0,0,0.9)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
        {/* Top Accent Line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#b5924d] to-transparent" />
        
        <div className="p-12">
          <div className="flex items-center space-x-4 mb-8">
            <div className="w-10 h-[1px] bg-[#b5924d]/40" />
            <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-[#b5924d]">Continuer le voyage</span>
          </div>

          <h2 className="text-3xl font-extralight tracking-tight text-white mb-6 leading-tight">
            Souhaitez-vous reprendre <br />
            <span className="text-[#b5924d] italic font-serif">"{title}"</span> ?
          </h2>

          <p className="text-gray-500 text-sm font-light mb-12 tracking-wide">
            Nous avons mémorisé votre progression à <span className="text-white font-medium">{formatTime(time)}</span>.
          </p>

          <div className="flex flex-col space-y-4">
            <ModalButton 
              focusKey="RESUME_CONFIRM"
              onClick={onConfirm}
              primary
            >
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>Reprendre la lecture</span>
            </ModalButton>
            
            <ModalButton 
              focusKey="RESUME_START_OVER"
              onClick={onStartOver}
            >
              Recommencer du début
            </ModalButton>
            
            <ModalButton 
              focusKey="RESUME_CANCEL"
              onClick={onClose}
              ghost
            >
              Annuler
            </ModalButton>
          </div>
        </div>
      </div>
    </div>
    </FocusContext.Provider>
  );
};

function ModalButton({ children, onClick, primary, ghost, focusKey }: any) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: onClick
  });

  if (ghost) {
    return (
      <button 
        ref={ref}
        onClick={onClick}
        className={`w-full text-[9px] font-bold uppercase tracking-[0.4em] pt-4 transition-colors outline-none
                   ${focused ? 'text-[#b5924d] scale-110' : 'text-gray-700'}`}
      >
        {children}
      </button>
    );
  }

  return (
    <button 
      ref={ref}
      onClick={onClick}
      className={`w-full py-5 rounded-sm font-bold text-[10px] uppercase tracking-[0.4em] transition-all flex items-center justify-center space-x-3 outline-none
                 ${primary 
                    ? (focused ? 'bg-white text-black scale-105 shadow-[0_0_30px_rgba(181,146,77,0.4)]' : 'bg-[#b5924d] text-black') 
                    : (focused ? 'bg-white text-black scale-105' : 'bg-white/5 text-white border border-white/10')}`}
    >
      {children}
    </button>
  );
}
