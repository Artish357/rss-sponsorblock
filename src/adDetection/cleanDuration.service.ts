// Service for extracting clean duration from various sources

export interface CleanDurationSource {
  type: 'rss' | 'transcript' | 'chapters';
  value: number; // duration in seconds
}

/**
 * Parse iTunes duration format into seconds
 * Handles formats like "HH:MM:SS", "MM:SS", or just seconds as string
 */
export function parseItunesDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  
  // Format 1: "HH:MM:SS" or "MM:SS"
  const timeMatch = duration.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1] || '0');
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseInt(timeMatch[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  // Format 2: Total seconds as string "2435"
  const secondsMatch = duration.match(/^\d+$/);
  if (secondsMatch) {
    return parseInt(duration);
  }
  
  // Format 3: "1h 23m 45s" style
  let totalSeconds = 0;
  const hourMatch = duration.match(/(\d+)h/);
  const minuteMatch = duration.match(/(\d+)m/);
  const secondMatch = duration.match(/(\d+)s/);
  
  if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
  if (minuteMatch) totalSeconds += parseInt(minuteMatch[1]) * 60;
  if (secondMatch) totalSeconds += parseInt(secondMatch[1]);
  
  return totalSeconds > 0 ? totalSeconds : null;
}

/**
 * Extract clean runtime from SRT format transcript
 */
export function extractFromSRT(content: string): number | null {
  const lines = content.split('\n');
  let lastTimestamp = 0;
  
  for (const line of lines) {
    // SRT timestamp format: "00:42:15,000 --> 00:42:20,000"
    const match = line.match(/(\d{2}):(\d{2}):(\d{2}),\d{3}\s*-->/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      lastTimestamp = hours * 3600 + minutes * 60 + seconds;
    }
  }
  
  return lastTimestamp > 0 ? lastTimestamp : null;
}

/**
 * Extract clean runtime from WebVTT format transcript
 */
export function extractFromWebVTT(content: string): number | null {
  const lines = content.split('\n');
  let lastTimestamp = 0;
  
  for (const line of lines) {
    // WebVTT timestamp format: "00:42:15.000 --> 00:42:20.000"
    const match = line.match(/(\d{2}):(\d{2}):(\d{2})\.\d{3}\s*-->/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      lastTimestamp = hours * 3600 + minutes * 60 + seconds;
    }
  }
  
  return lastTimestamp > 0 ? lastTimestamp : null;
}

/**
 * Extract clean runtime from JSON format (podcast namespace)
 */
export function extractFromJSON(content: string): number | null {
  try {
    const data = JSON.parse(content);
    
    // Handle podcast namespace format
    if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
      const lastSegment = data.segments[data.segments.length - 1];
      
      // Try different possible field names
      if (lastSegment.endTime) {
        return lastSegment.endTime;
      }
      if (lastSegment.startTime && lastSegment.duration) {
        return lastSegment.startTime + lastSegment.duration;
      }
    }
    
    // Handle simple duration field
    if (data.duration) {
      return typeof data.duration === 'number' ? data.duration : parseItunesDuration(data.duration);
    }
    
    return null;
  } catch (error) {
    console.error('[CleanDuration] Error parsing JSON transcript:', error);
    return null;
  }
}

/**
 * Extract clean runtime from transcript URL
 */
export async function extractCleanRuntimeFromTranscript(
  transcriptUrl: string,
  transcriptType?: string
): Promise<number | null> {
  try {
    const response = await fetch(transcriptUrl);
    if (!response.ok) {
      console.error(`[CleanDuration] Failed to fetch transcript: HTTP ${response.status} for ${transcriptUrl}`);
      return null;
    }
    
    const content = await response.text();
    
    // Determine format from content or type hint
    const type = transcriptType || detectTranscriptType(content, transcriptUrl);
    
    switch (type) {
      case 'srt':
        return extractFromSRT(content);
      case 'vtt':
      case 'webvtt':
        return extractFromWebVTT(content);
      case 'json':
        return extractFromJSON(content);
      default:
        console.error(`[CleanDuration] Unknown transcript type: ${type}`);
        return null;
    }
  } catch (error) {
    console.error('[CleanDuration] Error fetching transcript:', error, 'URL:', transcriptUrl);
    return null;
  }
}

/**
 * Detect transcript type from content or URL
 */
function detectTranscriptType(content: string, url: string): string {
  // Check URL extension
  if (url.endsWith('.srt')) return 'srt';
  if (url.endsWith('.vtt') || url.endsWith('.webvtt')) return 'vtt';
  if (url.endsWith('.json')) return 'json';
  
  // Check content patterns
  if (content.includes('WEBVTT')) return 'vtt';
  if (content.match(/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/m)) return 'srt';
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) return 'json';
  
  return 'unknown';
}

/**
 * Get clean duration from episode data with source priority
 */
export async function getCleanDuration(episode: {
  duration?: string;
  transcriptUrl?: string;
}): Promise<CleanDurationSource | null> {
  // Priority 1: RSS duration (most straightforward)
  if (episode.duration) {
    const duration = parseItunesDuration(episode.duration);
    if (duration) {
      return {
        type: 'rss',
        value: duration
      };
    }
  }
  
  // Priority 2: Transcript (if available)
  if (episode.transcriptUrl) {
    const duration = await extractCleanRuntimeFromTranscript(episode.transcriptUrl);
    if (duration) {
      return {
        type: 'transcript',
        value: duration
      };
    }
  }
  
  // No clean duration source available
  return null;
}