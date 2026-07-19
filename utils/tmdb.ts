import config from '../config.json';

const TMDB_API_KEY = (config as any).TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  character?: string;
  job?: string;
}

export const tmdbApi = {
  async searchPerson(name: string): Promise<number | null> {
    if (!TMDB_API_KEY) {
      console.warn("Clé API TMDB manquante dans config.json");
      return null;
    }

    try {
      const res = await fetch(`${BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}&language=fr-FR`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].id; // Prend le résultat le plus pertinent
      }
      return null;
    } catch (e) {
      console.error("Erreur TMDB searchPerson:", e);
      return null;
    }
  },

  async getPersonMovies(personId: number): Promise<TMDBMovie[]> {
    if (!TMDB_API_KEY) return [];

    try {
      const res = await fetch(`${BASE_URL}/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`);
      const data = await res.json();
      
      // Combine cast and crew (director/producer etc.), remove duplicates by ID
      const allMovies = [...(data.cast || []), ...(data.crew || [])];
      
      const uniqueMovies = Array.from(new Map(allMovies.map(m => [m.id, m])).values());
      
      // Trier par popularité ou date de sortie
      return uniqueMovies.sort((a: any, b: any) => {
        return (b.popularity || 0) - (a.popularity || 0);
      }).map((m: any) => ({
        id: m.id,
        title: m.title,
        original_title: m.original_title,
        release_date: m.release_date,
        poster_path: m.poster_path,
        character: m.character,
        job: m.job
      }));
    } catch (e) {
      console.error("Erreur TMDB getPersonMovies:", e);
      return [];
    }
  }
};
