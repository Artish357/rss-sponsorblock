// Audio download service
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import path from 'path';
import axios, { AxiosError, type AxiosResponse } from 'axios';

/**
 * Download audio file from URL
 */
export const downloadAudio = async (url: string, feedHash: string, episodeGuid: string): Promise<string> => {
  // Create directory structure
  const audioDir = path.join(process.env.STORAGE_AUDIO_DIR || './storage/audio', feedHash, 'original');
  mkdirSync(audioDir, { recursive: true });

  // Generate file path
  const fileName = `${episodeGuid}.mp3`;
  const filePath = path.join(audioDir, fileName);

  console.log(`Downloading audio from: ${url}`);
  console.log(`Saving to: ${filePath}`);

  try {
    // Download audio with timeout
    const timeout = parseInt(process.env.DOWNLOAD_TIMEOUT || '300000', 10); // 5 minutes default

    const response: AxiosResponse = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout,
      headers: {
        'User-Agent': 'RSS-SponsorBlock/1.0'
      }
    });

    // Check content type
    const contentType = response.headers['content-type'] as string | undefined;
    if (!contentType || !contentType.includes('audio')) {
      console.warn(`Warning: Unexpected content-type: ${contentType}`);
    }

    // Create write stream and pipe the response
    const writer = createWriteStream(filePath);
    response.data.pipe(writer);

    // Wait for download to complete
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });

    console.log(`Download complete: ${filePath}`);
    return filePath;

  } catch (error) {
    if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
      throw new Error('Download timeout exceeded');
    }
    throw new Error(`Download failed: ${error instanceof Error && error.message}`);
  }
};

/**
 * Check if audio file already exists
 */
export const getExistingAudioPath = (feedHash: string, episodeGuid: string): string | null => {
  const filePath = path.join(
    process.env.STORAGE_AUDIO_DIR || './storage/audio',
    feedHash,
    'original',
    `${episodeGuid}.mp3`
  );

  if (existsSync(filePath)) {
    return filePath;
  }

  return null;
};