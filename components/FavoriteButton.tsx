import React from 'react';
import { useDataStore } from '../store/useDataStore';
import FavoriteModal from './FavoriteModal';

interface FavoriteButtonProps {
  item: any;
  className?: string;
}

export function FavoriteButton({ item, className = "" }: FavoriteButtonProps) {
  const { isFavorite } = useDataStore();
  const [showModal, setShowModal] = React.useState(false);
  
  const id = item.stream_id || item.series_id || item.id;
  const favorite = isFavorite(id);

  return (
    <>
      <button 
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        className={`p-2 rounded-full transition-all ${favorite ? 'text-netflix-red bg-white/10 scale-110' : 'text-white bg-black/40 hover:bg-black/60'} ${className}`}
        title={favorite ? "Gérer les favoris / Noter" : "Ajouter à une section"}
      >
        <svg className="w-6 h-6" fill={favorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>

      {showModal && <FavoriteModal item={item} onClose={() => setShowModal(false)} />}
    </>
  );
}
