import { Router } from "express";
import { fetchFeed, replaceAudioUrls, stripOutSelfLinks } from "./feed.service";
import { createOrUpdateEpisode } from "../episode/episode.model";
import { processBacklogWithMetadata } from "../episode/episode.service";

const router = Router()

// RSS proxy route
router.get('/*', async (req, res) => {
  const url = req.url.replace('/', '');

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'RSS URL required' });
    return;
  }

  try {
    // Fetch and parse RSS feed
    const feed = await fetchFeed(url);
    console.log(`Fetched RSS feed: ${feed.title} (${feed.episodes.length} episodes)`);

    // Store episode metadata with original URLs (secure internal storage)
    for (const episode of feed.episodes) {
      // Parse clean duration if available
      const cleanDuration = episode.duration ? 
        await import('../adDetection/cleanDuration.service').then(m => m.parseItunesDuration(episode.duration)) : 
        null;
      
      await createOrUpdateEpisode(feed.feedHash, episode.guid, {
        original_url: episode.audioUrl,
        clean_duration: cleanDuration,
        clean_duration_source: cleanDuration ? 'rss' : null,
        transcript_url: episode.transcriptUrl || null
      });
    }

    // Replace audio URLs with local proxy URLs (no original URLs exposed)
    const host = req.get('host');
    if (!host) {
      throw new Error('Host is undefined');
    }
    const modifiedXml = await stripOutSelfLinks(await replaceAudioUrls(feed, host));

    // Queue first 3 episodes for background processing with metadata
    const episodesToProcess = feed.episodes.slice(0, 3).map(ep => ({
      feed_hash: feed.feedHash,
      episode_guid: ep.guid,
      original_url: ep.audioUrl,
      metadata: {
        duration: ep.duration,
        transcriptUrl: ep.transcriptUrl
      }
    }));

    // Process in background without blocking response
    processBacklogWithMetadata(episodesToProcess);

    res.type('application/rss+xml').send(modifiedXml);
  } catch (error) {
    console.error('Error processing RSS feed:', error);
    res.status(500).json({ error: 'Failed to process RSS feed' });
  }
});

export const feedRouter = router;