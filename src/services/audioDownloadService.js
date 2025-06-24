// Audio download service
import { createWriteStream, mkdirSync } from 'fs';
import path from 'path';
import axios from 'axios';

/**
 * Download audio file from URL
 * @param {string} url - Audio URL to download
 * @param {string} feedHash - Feed hash for organizing storage
 * @param {string} episodeGuid - Episode GUID for file naming
 * @returns {Promise<string>} - Path to downloaded file
 */
export const downloadAudio = async (url, feedHash, episodeGuid) => {
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
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: timeout,
      headers: {
        'User-Agent': 'RSS-SponsorBlock/1.0'
      }
    });

    // Check content type
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('audio')) {
      console.warn(`Warning: Unexpected content-type: ${contentType}`);
    }

    // Create write stream and pipe the response
    const writer = createWriteStream(filePath);
    response.data.pipe(writer);

    // Wait for download to complete
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });

    console.log(`Download complete: ${filePath}`);
    return filePath;

  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Download timeout exceeded');
    }
    throw new Error(`Download failed: ${error.message}`);
  }
};

/**
 * Check if audio file already exists
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @returns {string|null} - File path if exists, null otherwise
 */
export const getExistingAudioPath = (feedHash, episodeGuid) => {
  const filePath = path.join(
    process.env.STORAGE_AUDIO_DIR || './storage/audio',
    feedHash,
    'original',
    `${episodeGuid}.mp3`
  );

  try {
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  } catch (error) {
    // File doesn't exist
  }

  return null;
};