// RSS fetching, parsing, and URL replacement service
import { createHash } from 'crypto';
import xml2js from 'xml2js';
import type { RSSFeed, RSSEpisode } from '../general/types.js';
import { createOrUpdateFeed, getFeed } from './feed.model.js';
import { parseItunesDuration } from '../adDetection/cleanDuration.service.js';

export const generateAudioUrl = (feedHash: string, episodeGuid: string, baseUrl: string): string => {
  // Clean episode GUID to ensure URL-safe format
  const safeGuid = encodeURIComponent(episodeGuid);
  return `${baseUrl}/audio/${feedHash}/${safeGuid}.mp3`;
};

export const fetchFeed = async (url: string): Promise<RSSFeed> => {
  try {
    // 1. Fetch RSS XML from external URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const xmlData = await response.text();

    // 2. Parse XML using xml2js
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    // 3. Generate feed hash for storage organization
    const feedHash = createHash('md5').update(url).digest('hex');

    // 4. Extract episode metadata
    const channel = result.rss?.channel?.[0];
    if (!channel) {
      throw new Error('Invalid RSS feed: missing channel');
    }

    const items = channel.item || [];
    const episodes: RSSEpisode[] = items.map((item: any) => {
      const enclosure = item.enclosure?.[0];
      if (!enclosure?.$ || !enclosure.$.url) {
        return null; // Skip items without audio
      }

      return {
        title: item.title?.[0] || '',
        guid: item.guid?.[0]?._ || item.guid?.[0] || '',
        audioUrl: enclosure.$.url,
        description: item.description?.[0] || '',
        pubDate: item.pubDate?.[0] || '',
        duration: item['itunes:duration']?.[0] || '',
        artwork: item['itunes:image']?.[0]?.$.href || channel['itunes:image']?.[0]?.$.href || '',
        transcriptUrl: item['podcast:transcript']?.[0]?.$.url || ''
      };
    }).filter(Boolean) as RSSEpisode[]; // Remove null entries

    const feedData = {
      feedHash,
      title: channel.title?.[0] || '',
      description: channel.description?.[0] || '',
      episodes,
      originalXml: xmlData
    };

    // Store feed in database
    await createOrUpdateFeed(feedHash, {
      feed_url: url,
      title: feedData.title,
      description: feedData.description,
      raw_xml: xmlData
    });

    return feedData;
  } catch (error) {
    throw new Error(`Failed to fetch RSS feed: ${(error as Error).message}`);
  }
};

export const replaceAudioUrls = async (feed: RSSFeed, baseUrl: string): Promise<string> => {
  try {
    // Parse the original XML to properly modify it
    const parser = new xml2js.Parser();
    const builder = new xml2js.Builder();
    const parsedXml = await parser.parseStringPromise(feed.originalXml);

    // Create a map of original URLs to episode data for faster lookup
    const urlToEpisode = new Map<string, RSSEpisode>();
    feed.episodes.forEach(episode => {
      urlToEpisode.set(episode.audioUrl, episode);
    });

    // Modify audio URLs in the parsed XML structure
    const channel = parsedXml.rss?.channel?.[0];
    if (channel && channel.item) {
      channel.item.forEach((item: any) => {
        if (item.enclosure) {
          item.enclosure?.forEach((enclosure: any) => {
            if (enclosure.$ && enclosure.$.url) {
              const originalUrl = enclosure.$.url;
              const episode = urlToEpisode.get(originalUrl);
              if (episode && episode.guid) {
                enclosure.$.url = generateAudioUrl(feed.feedHash, episode.guid, baseUrl);
              }
            }
          });
          item['media:content']?.forEach((enclosure: any) => {
            if (enclosure.$ && enclosure.$.url) {
              const originalUrl = enclosure.$.url;
              const episode = urlToEpisode.get(originalUrl);
              if (episode && episode.guid) {
                enclosure.$.url = generateAudioUrl(feed.feedHash, episode.guid, baseUrl);
              }
              if (enclosure['media:player']) {
                delete enclosure['media:player'];
              }
            }
          });
        }
      });
    }

    // Build the modified XML
    const modifiedXml = builder.buildObject(parsedXml);
    return modifiedXml;
  } catch (error) {
    throw new Error(`Failed to replace audio URLs: ${(error as Error).message}`);
  }
};

export async function stripOutSelfLinks(xml: string) {
  const parser = new xml2js.Parser();
  const builder = new xml2js.Builder();
  const parsedXml = await parser.parseStringPromise(xml);
  const channel = parsedXml.rss?.channel?.[0];
  channel['atom:link'] = channel['atom:link'].filter( (x: any) => {
    if (['self', 'first', 'last'].includes(x.$.rel)) {
        return false;
    }
    return true;
  });
  delete channel['itunes:new-feed-url'];
  return builder.buildObject(parsedXml);
}

export async function getEpisodeCleanDurationFromFeed(feedHash: string, episodeGuid: string): Promise<number | null> {
  try {
    // Get feed from database
    const feed = await getFeed(feedHash);
    if (!feed || !feed.raw_xml) {
      return null;
    }

    // Parse the XML
    const parser = new xml2js.Parser();
    const parsedXml = await parser.parseStringPromise(feed.raw_xml);
    
    // Find the episode
    const channel = parsedXml.rss?.channel?.[0];
    if (!channel || !channel.item) {
      return null;
    }

    // Look for the episode by GUID
    for (const item of channel.item) {
      const itemGuid = item.guid?.[0]?._ || item.guid?.[0] || '';
      if (itemGuid === episodeGuid) {
        // Extract duration
        const duration = item['itunes:duration']?.[0];
        if (duration) {
          return parseItunesDuration(duration);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting clean duration from feed:', error);
    return null;
  }
} 