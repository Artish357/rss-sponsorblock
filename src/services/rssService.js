// RSS fetching, parsing, and URL replacement service
import { createHash } from 'crypto';
import xml2js from 'xml2js';

export const generateAudioUrl = (feedHash, episodeGuid) => {
  const baseUrl = process.env.SERVER_BASE_URL || 'http://localhost:3000';
  // Clean episode GUID to ensure URL-safe format
  const safeGuid = encodeURIComponent(episodeGuid);
  return `${baseUrl}/audio/${feedHash}/${safeGuid}.mp3`;
};

export const fetchFeed = async (url) => {
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
    const episodes = items.map(item => {
      const enclosure = item.enclosure?.[0];
      if (!enclosure?.$ || !enclosure.$.url) {
        return null; // Skip items without audio
      }

      return {
        title: item.title?.[0] || '',
        guid: item.guid?.[0]?._ || item.guid?.[0] || '',
        audioUrl: enclosure.$.url,
        description: item.description?.[0] || '',
        pubDate: item.pubDate?.[0] || ''
      };
    }).filter(Boolean); // Remove null entries

    return {
      feedHash,
      title: channel.title?.[0] || '',
      description: channel.description?.[0] || '',
      episodes,
      originalXml: xmlData
    };
  } catch (error) {
    throw new Error(`Failed to fetch RSS feed: ${error.message}`);
  }
};

export const replaceAudioUrls = async (feed) => {
  try {
    // Parse the original XML to properly modify it
    const parser = new xml2js.Parser();
    const builder = new xml2js.Builder();
    const parsedXml = await parser.parseStringPromise(feed.originalXml);

    // Create a map of original URLs to episode data for faster lookup
    const urlToEpisode = new Map();
    feed.episodes.forEach(episode => {
      urlToEpisode.set(episode.audioUrl, episode);
    });

    // Modify audio URLs in the parsed XML structure
    const channel = parsedXml.rss?.channel?.[0];
    if (channel && channel.item) {
      channel.item.forEach(item => {
        if (item.enclosure) {
          item.enclosure.forEach(enclosure => {
            if (enclosure.$ && enclosure.$.url) {
              const originalUrl = enclosure.$.url;
              const episode = urlToEpisode.get(originalUrl);
              if (episode && episode.guid) {
                enclosure.$.url = generateAudioUrl(feed.feedHash, episode.guid);
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
    throw new Error(`Failed to replace audio URLs: ${error.message}`);
  }
};
