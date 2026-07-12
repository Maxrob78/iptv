import React from 'react';

interface SearchBarProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Rechercher..." }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-md mx-auto xl:mx-0 xl:mr-auto mb-8">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        className="block w-full pl-10 pr-3 py-3 border border-transparent rounded-md leading-5 bg-gray-800 text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-gray-700 focus:border-netflix-red focus:ring-1 focus:ring-netflix-red sm:text-sm transition-colors"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
