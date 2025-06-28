// Shared type definitions for RSS SponsorBlock

export interface Episode {
  feed_hash: string;
  episode_guid: string;
  original_url: string;
  file_path: string | null;
  ad_segments: AdSegment[] | null;
  status: EpisodeStatus;
  processed_at: string;
}

export interface AdSegment {
  start: number;
  end: number;
}

export type EpisodeStatus = 'pending' | 'downloading' | 'analyzing' | 'processing' | 'processed' | 'error';

export interface RSSFeed {
  title: string;
  description: string;
  feedHash: string;
  episodes: RSSEpisode[];
  originalXml: string;
}

export interface RSSEpisode {
  title: string;
  description: string;
  guid: string;
  audioUrl: string;
  pubDate: string;
  duration?: string;
  artwork?: string;
}

export interface ProcessingResult {
  success: boolean;
  episodeGuid: string;
  file_path?: string;
  error?: string;
}

export interface AudioChunkInfo {
  path: string;
  startTime: number;
  duration: number;
}

export interface DatabaseConfig {
  client: string;
  connection: {
    filename: string;
  };
  migrations: {
    directory: string;
  };
  useNullAsDefault: boolean;
}