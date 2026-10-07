import defaultConfig from '../config.json';

interface AppConfig {
  OPEN_SUBTITLES_API_KEY?: string;
  TMDB_API_KEY?: string;
  OMDB_API_KEY?: string;
  ENABLE_SUBTITLES?: boolean;
}

let loadedLocalConfig: AppConfig = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  loadedLocalConfig = require('../config.local.json');
} catch {
  // config.local.json n'existe pas sur les machines où il n'a pas été posé
  loadedLocalConfig = {};
}

const config: AppConfig = {
  ...defaultConfig,
  ...loadedLocalConfig,
};

export const TMDB_API_KEY = config.TMDB_API_KEY || '';
export const OMDB_API_KEY = config.OMDB_API_KEY || '';
export const OPEN_SUBTITLES_API_KEY = config.OPEN_SUBTITLES_API_KEY || '';
export const ENABLE_SUBTITLES = config.ENABLE_SUBTITLES ?? true;

export default config;
