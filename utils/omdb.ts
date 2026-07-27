const OMDB_API_KEY: string = '57d5d43c';
const OMDB_API_URL = 'http://www.omdbapi.com/';

export async function fetchOmdbRating(title: string, year?: string, type?: 'movie' | 'series', imdbId?: string): Promise<string | null> {
  if (!title && !imdbId) return null;
  if (OMDB_API_KEY === 'YOUR_API_KEY') {
    console.warn("Clé API OMDb manquante. Veuillez l'ajouter dans utils/omdb.ts");
    return null;
  }

  // Utilisation d'un cache localStorage pour limiter les appels API (quota de 1000/jour gratuit)
  const cacheKey = `omdb_v9_${imdbId || title}_${year || ''}_${type || ''}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      if (cached === 'NOT_FOUND') return null;
      return cached;
    }
  } catch (e) {
    // Ignorer les erreurs localStorage
  }

  try {
    const params = new URLSearchParams();
    params.append('apikey', OMDB_API_KEY);
    
    if (imdbId) {
        params.append('i', imdbId);
    } else {
        let cleanTitle = title.trim();
        // Remove IPTV prefixes like |FR|, [VOD], FR|, 4K|, (VOD), etc.
        cleanTitle = cleanTitle.replace(/^(\[.*?\]|\|.*?\||[^|]*?\|\s*|\(.*?\)|\{.*?\})\s*/i, '').trim();
        if (cleanTitle.includes('(')) {
            cleanTitle = cleanTitle.split('(')[0].trim();
        }
        params.append('t', cleanTitle);
    }
    
    // On n'envoie pas l'année car si l'IPTV se trompe d'un an, OMDb ne trouve rien.
    // if (year) {
    //     const yearMatch = year.match(/\d{4}/);
    //     if (yearMatch) {
    //         params.append('y', yearMatch[0]);
    //     }
    // }
    if (type) params.append('type', type);

    const response = await fetch(`${OMDB_API_URL}?${params.toString()}`);
    const data = await response.json();

    if (data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
      const rating = data.imdbRating;
      try {
        localStorage.setItem(cacheKey, rating);
      } catch (e) {}
      return rating;
    }
    
    if (data.Error === 'Movie not found!') {
        try {
            localStorage.setItem(cacheKey, 'NOT_FOUND');
        } catch(e) {}
    }
    
    return null;
  } catch (error: any) {
    console.error('Erreur lors de la récupération de la note OMDb:', error);
    return null;
  }
}
