import { useAuthStore } from '../store/useAuthStore';

// Définitions des types Xtream
export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

class XtreamAPI {
  private getBaseUrl() {
    const { serverUrl, username, password } = useAuthStore.getState();
    if (!serverUrl) throw new Error("Non connecté");
    return `${serverUrl}/player_api.php?username=${username}&password=${password}`;
  }

  public getStreamUrl(streamId: number, type: 'live' | 'movie' | 'series' = 'live', extension: string = 'm3u8') {
    let { serverUrl, username, password } = useAuthStore.getState();
    
    // Si l'URL n'a pas de port (pas de :) et n'est pas https, on force le port 80
    if (serverUrl && !serverUrl.includes(':', 6) && serverUrl.startsWith('http://')) {
      serverUrl = `${serverUrl}:80`;
    }

    return `${serverUrl}/${type}/${username}/${password}/${streamId}.${extension}`;
  }

  private ensureArray(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) return Object.values(data);
    return [];
  }

  async getLiveCategories(): Promise<Category[]> {
    const res = await fetch(`${this.getBaseUrl()}&action=get_live_categories`);
    return this.ensureArray(await res.json());
  }

  async getLiveStreams(categoryId?: string): Promise<LiveStream[]> {
    const url = categoryId 
      ? `${this.getBaseUrl()}&action=get_live_streams&category_id=${categoryId}`
      : `${this.getBaseUrl()}&action=get_live_streams`;
    
    const res = await fetch(url);
    return this.ensureArray(await res.json());
  }

  async getVodCategories(): Promise<Category[]> {
    const res = await fetch(`${this.getBaseUrl()}&action=get_vod_categories`);
    return this.ensureArray(await res.json());
  }

  async getVodStreams(categoryId?: string): Promise<any[]> {
    const url = categoryId 
      ? `${this.getBaseUrl()}&action=get_vod_streams&category_id=${categoryId}`
      : `${this.getBaseUrl()}&action=get_vod_streams`;
    
    const res = await fetch(url);
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return this.ensureArray(data);
    } catch (e: any) {
      throw new Error(`Erreur JSON (${res.status}). Reçu: ${text.substring(0, 150)}`);
    }
  }

  async getSeriesInfo(seriesId: number): Promise<any> {
    const res = await fetch(`${this.getBaseUrl()}&action=get_series_info&series_id=${seriesId}`);
    return await res.json();
  }

  async getVodInfo(vodId: number): Promise<any> {
    const res = await fetch(`${this.getBaseUrl()}&action=get_vod_info&vod_id=${vodId}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e: any) {
      throw new Error(`Erreur JSON VOD Info (${res.status}). Reçu: ${text.substring(0, 150)}`);
    }
  }
}

export const xtreamApi = new XtreamAPI();
