// In-memory storage service (will be replaced with SQLite later)

// In-memory storage for episode metadata
const episodeStorage = new Map();

const getEpisodeKey = (feedHash, episodeGuid) => `${feedHash}:${episodeGuid}`;

export const initDatabase = async () => {
  // Initialize in-memory storage (no-op for now)
  console.log('Storage service initialized (in-memory)');
};

export const getEpisode = async (feedHash, episodeGuid) => {
  const key = getEpisodeKey(feedHash, episodeGuid);
  const episode = episodeStorage.get(key);
  return episode || null;
};

export const saveEpisode = async (feedHash, episodeGuid, data) => {
  const key = getEpisodeKey(feedHash, episodeGuid);
  const episode = {
    feedHash,
    episodeGuid,
    originalUrl: data.originalUrl,
    filePath: data.filePath || null,
    adSegments: data.adSegments || null,
    processedAt: new Date().toISOString()
  };
  
  episodeStorage.set(key, episode);
  return episode;
};