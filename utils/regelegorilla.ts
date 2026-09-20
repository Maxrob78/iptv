/**
 * utils/regelegorilla.ts
 *
 * Recupere la note personnelle du critique/utilisateur Letterboxd "regelegorila"
 * pour un film donne (si disponible).
 *
 * URL : https://letterboxd.com/regelegorila/film/<slug>/
 * et flux RSS : https://letterboxd.com/regelegorila/rss/
 *
 * Cache : localStorage, TTL 7 jours.
 */

import { findLetterboxdSlug, cleanTitleForSearch, extractYearFromTitle } from './letterboxd';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USERNAME = 'regelegorila';

interface CacheEntry {
  value: string | null;
  timestamp: number;
}

function getCached(key: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry.value;
  } catch {
    return undefined;
  }
}

function setCache(key: string, value: string | null): void {
  try {
    const entry: CacheEntry = { value, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota ou mode prive
  }
}

/**
 * Verifie si le film est present dans le flux RSS des dernieres critiques de regelegorila.
 */
async function checkRssForRating(slug: string, cleanTitle: string, year?: string): Promise<string | null> {
  try {
    const res = await fetch('https://letterboxd.com/' + USERNAME + '/rss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const text = await res.text();
    const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];

    const slugNoYear = slug.replace(/-\d{4}$/, '');
    const y = year ? year.match(/\d{4}/)?.[0] : null;

    for (const item of items) {
      const link = item.match(/<link>([^<]+)<\/link>/)?.[1] || '';
      const title = item.match(/<letterboxd:filmTitle>([^<]+)<\/letterboxd:filmTitle>/)?.[1] || '';
      const itemYear = item.match(/<letterboxd:filmYear>([^<]+)<\/letterboxd:filmYear>/)?.[1];
      const rating = item.match(/<letterboxd:memberRating>([^<]+)<\/letterboxd:memberRating>/)?.[1];

      if (rating) {
        const matchesSlug = link.includes('/film/' + slug + '/') || (slugNoYear && link.includes('/film/' + slugNoYear + '/'));
        const matchesTitle = title.toLowerCase() === cleanTitle.toLowerCase();

        if (matchesSlug || matchesTitle) {
          // Si une annee est specifiee et que l'item en a une differente de plus de 1 an, verifier
          if (y && itemYear && Math.abs(parseInt(y) - parseInt(itemYear)) > 1) {
            continue;
          }
          const num = parseFloat(rating);
          if (!isNaN(num)) {
            return (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)) + '/5';
          }
        }
      }
    }
  } catch {
    // Continuer avec la page directe
  }
  return null;
}

/**
 * Scrape la page critique specifique de regelegorila pour ce film.
 * Teste la page AVEC annee et SANS annee.
 * Ex: /film/resident-evil-2026/ et /film/resident-evil/
 */
async function scrapeUserReviewPage(slug: string, year?: string): Promise<string | null> {
  const slugsToTry = new Set<string>();
  slugsToTry.add(slug);

  const slugNoYear = slug.replace(/-\d{4}$/, '');
  slugsToTry.add(slugNoYear);

  if (year) {
    const y = year.match(/\d{4}/)?.[0];
    if (y) {
      slugsToTry.add(slugNoYear + '-' + y);
    }
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html'
  };

  for (const s of Array.from(slugsToTry)) {
    const url = 'https://letterboxd.com/' + USERNAME + '/film/' + s + '/';
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue; // 404 si pas de critique sur cette variante
      const html = await resp.text();

      // 1. JSON-LD reviewRating
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const clean = jsonLdMatch[1]
            .replace(/\/\* <\!\[CDATA\[ \*\//g, '')
            .replace(/\/\* \]\]> \*\//g, '')
            .trim();
          const parsed = JSON.parse(clean);
          const rv = parsed?.reviewRating?.ratingValue;
          if (rv && !isNaN(parseFloat(rv))) {
            const num = parseFloat(rv);
            return (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)) + '/5';
          }
        } catch {
          // suite
        }
      }

      // 2. Meta twitter:data2 (ex: content="★★★★½")
      const twitterMeta = html.match(/<meta\s+name="twitter:data2"\s+content="([^"]+)"/);
      if (twitterMeta && twitterMeta[1]) {
        const starsStr = twitterMeta[1];
        const fullStars = (starsStr.match(/★/g) || []).length;
        const halfStars = (starsStr.match(/½/g) || []).length * 0.5;
        const total = fullStars + halfStars;
        if (total > 0) {
          return (total % 1 === 0 ? total.toFixed(0) : total.toFixed(1)) + '/5';
        }
      }

      // 3. Classes rated-X (X = 1..10)
      const ratedMatch = html.match(/rated-(\d+)/);
      if (ratedMatch) {
        const val = parseInt(ratedMatch[1]) / 2;
        if (!isNaN(val) && val > 0) {
          return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + '/5';
        }
      }
    } catch {
      // continuer
    }
  }

  return null;
}

/**
 * Point d'entree principal.
 * Retourne la note de regelegorila (ex: "4.5/5") ou null si non disponible.
 */
export async function fetchRegelegorillaRating(
  title: string,
  year?: string,
  imdbId?: string
): Promise<string | null> {
  if (!title && !imdbId) return null;

  const cleanTitle = cleanTitleForSearch(title);
  const { titleClean: titleNoYear, yearFound } = extractYearFromTitle(cleanTitle);
  const effectiveYear = year ? (year.match(/\d{4}/)?.[0] || null) : yearFound;

  const cacheKey = 'reg_v5_' + cleanTitle.toLowerCase() + '_' + (effectiveYear || '') + '_' + (imdbId || '');
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const slug = await findLetterboxdSlug(titleNoYear || cleanTitle, effectiveYear || undefined, imdbId);
    if (!slug) {
      setCache(cacheKey, null);
      return null;
    }

    // 1. Tenter via RSS
    let rating = await checkRssForRating(slug, cleanTitle, effectiveYear || undefined);

    // 2. Si non trouve dans RSS, verifier sa page critique (avec et sans annee)
    if (!rating) {
      rating = await scrapeUserReviewPage(slug, effectiveYear || undefined);
    }

    setCache(cacheKey, rating);
    return rating;
  } catch (err) {
    console.warn('[Regelegorilla] Erreur lors de la recuperation de la note :', err);
    return null;
  }
}
