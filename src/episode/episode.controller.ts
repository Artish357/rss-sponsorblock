import { Router } from "express";
import { Episode } from "../general/types";
import { getEpisode } from "./episode.model";
import { processEpisode } from "./episode.service";

const router = Router()

// Processing locks to prevent duplicate processing
const processingLocks = new Map<string, Promise<Episode>>();

// Secure audio serving route - uses internal IDs only
router.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res): Promise<void> => {
  const { feedHash, episodeGuid } = req.params;
  const decodedGuid = decodeURIComponent(episodeGuid);
  const lockKey = `${feedHash}:${decodedGuid}`;

  try {
    // Look up episode metadata using internal IDs
    const episode = await getEpisode(feedHash, decodedGuid);

    if (!episode) {
      res.status(404).json({ error: 'Episode not found' });
      return;
    }

    // If already processed, serve the file
    if (episode.status === 'processed' && episode.file_path) {
      console.log(`Serving processed audio: ${episode.file_path}`);
      res.sendFile(episode.file_path, { root: process.cwd() });
      return;
    }

    // Start processing if not already started
    if (!processingLocks.has(lockKey) && (episode.status === 'pending' || episode.status === 'error')) {
      console.log(`Starting audio processing for: ${decodedGuid}`);

      // Use metadata from database if available
      const processingPromise = processEpisode(
        feedHash, 
        decodedGuid, 
        episode.original_url,
        {
          duration: episode.clean_duration ? `${episode.clean_duration}` : undefined,
          transcriptUrl: episode.transcript_url || undefined
        }
      );

      // Store promise in locks map
      processingLocks.set(lockKey, processingPromise);
      processingPromise.finally(()=>{
        processingLocks.delete(lockKey);
      });
    }

    // If processing is in progress, wait for it
    if (processingLocks.has(lockKey)) {
      console.log(`Waiting for processing to complete: ${lockKey}`);
      try {
        await processingLocks.get(lockKey);
        // Re-fetch episode after processing
        const processed = await getEpisode(feedHash, decodedGuid);
        if (processed && processed.file_path) {
          res.sendFile(processed.file_path, { root: process.cwd() });
          return;
        }
      } catch (error) {
        console.error('Processing failed:', error);
        res.status(500).json({ error: 'Audio processing failed' });
        return;
      }
    }

    console.log('Other status:', episode);
    // Other statuses (downloading, analyzing, processing)
    res.status(202).json({
      status: episode.status,
      message: `Episode is currently ${episode.status}. Please try again later.`
    });
  } catch (error) {
    console.error('Error serving audio:', error);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

export const episodeRouter = router