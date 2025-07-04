// Ad segment verification service
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { AdSegment } from '../general/types';
import { extractAudioChunk } from '../trimming/trimming.service';
import { timeToSeconds, secondsToTime } from '../general/timeHelpers';
import { firstAdBreakPrompt, firstAdBreakSchema } from './prompt';

// Configuration from environment
const CONTEXT_PADDING = parseInt(process.env.AD_CONTEXT_PADDING_SECONDS || '30', 10);
const CHUNK_DURATION = parseInt(process.env.AD_CHUNK_DURATION_SECONDS || '1800', 10);
const DURATION_TOLERANCE = parseInt(process.env.AD_DURATION_TOLERANCE_SECONDS || '30', 10);

interface ChunkBoundaries {
  start: number;
  end: number;
}

/**
 * Calculate optimal chunk boundaries for verification
 * Ensures we capture the full ad break with context while avoiding overlaps
 */
export function calculateVerificationChunk(
  segment: AdSegment,
  allSegments: AdSegment[],
  audioDuration: number,
  maxChunkDuration: number = CHUNK_DURATION
): ChunkBoundaries {
  // Use configured context padding from environment
  
  // Start with ideal boundaries (segment + padding)
  let chunkStart = Math.max(0, segment.start - CONTEXT_PADDING);
  let chunkEnd = Math.min(audioDuration, segment.end + CONTEXT_PADDING);
  
  // Find this segment in the sorted list
  const sortedSegments = [...allSegments].sort((a, b) => a.start - b.start);
  const segmentIndex = sortedSegments.findIndex(s => 
    s.start === segment.start && s.end === segment.end
  );
  
  // Adjust start to avoid overlapping with previous segment
  if (segmentIndex > 0) {
    const prevSegment = sortedSegments[segmentIndex - 1];
    if (chunkStart < prevSegment.end) {
      // Split the gap between segments
      const gap = segment.start - prevSegment.end;
      chunkStart = prevSegment.end + Math.min(gap / 2, CONTEXT_PADDING);
    }
  }
  
  // Adjust end to avoid overlapping with next segment
  if (segmentIndex < sortedSegments.length - 1) {
    const nextSegment = sortedSegments[segmentIndex + 1];
    if (chunkEnd > nextSegment.start) {
      // Split the gap between segments
      const gap = nextSegment.start - segment.end;
      chunkEnd = segment.end + Math.min(gap / 2, CONTEXT_PADDING);
    }
  }
  
  // Ensure chunk doesn't exceed max duration
  if (chunkEnd - chunkStart > maxChunkDuration) {
    // Center the segment in the chunk
    const segmentDuration = segment.end - segment.start;
    const availableForPadding = maxChunkDuration - segmentDuration;
    const paddingEach = availableForPadding / 2;
    
    chunkStart = Math.max(0, segment.start - paddingEach);
    chunkEnd = Math.min(audioDuration, segment.end + paddingEach);
  }
  
  return { 
    start: Math.floor(chunkStart), 
    end: Math.ceil(chunkEnd) 
  };
}

/**
 * Verify a detected ad segment with refined detection
 */
export async function verifyAdBreak(
  audioPath: string,
  segment: AdSegment,
  allSegments: AdSegment[],
  audioDuration: number,
  customClient?: GoogleGenerativeAI,
  customModel?: string
): Promise<AdSegment | null> {
  // Calculate optimal chunk boundaries
  const chunk = calculateVerificationChunk(
    segment, 
    allSegments, 
    audioDuration
  );
  
  // Extract the chunk
  const chunkDuration = chunk.end - chunk.start;
  const chunkPath = await extractAudioChunk(
    audioPath,
    chunk.start,
    chunkDuration
  );
  
  // Calculate segment timestamps relative to chunk
  const relativeStart = segment.start - chunk.start;
  const relativeEnd = segment.end - chunk.start;
  
  try {
    const client = customClient || new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const modelName = customModel || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: firstAdBreakSchema
      }
    });
    
    console.log(`Verifying segment ${segment.start}-${segment.end}s as ${secondsToTime(relativeStart)}-${secondsToTime(relativeEnd)} in chunk`);
    
    const audioData = readFileSync(chunkPath);
    const base64Audio = audioData.toString('base64');
    
    const result = await model.generateContent([
      { text: firstAdBreakPrompt },
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: base64Audio
        }
      },
    ]);
    
    const parsed = JSON.parse(result.response.text()).ad_break;
    
    if (!parsed) {
      console.log(`Verification rejected ad at ${segment.start}-${segment.end}: Not an advertisement`);
      return null;
    }
    
    // Convert relative times back to absolute
    const verifiedSegment: AdSegment = {
      start: chunk.start + timeToSeconds(parsed.start),
      end: chunk.start + timeToSeconds(parsed.end),
      confidence: parsed.confidence
    };
    
    // Log adjustments if any
    const startDiff = verifiedSegment.start - segment.start;
    const endDiff = verifiedSegment.end - segment.end;
    
    if (Math.abs(startDiff) > 1 || Math.abs(endDiff) > 1) {
      console.log(
        `Adjusted timestamps: ${segment.start}-${segment.end} → ` +
        `${verifiedSegment.start}-${verifiedSegment.end} ` +
        `(start ${startDiff > 0 ? '+' : ''}${startDiff}s, end ${endDiff > 0 ? '+' : ''}${endDiff}s)`
      );
    }
    
    return verifiedSegment;
    
  } finally {
    await unlink(chunkPath).catch(() => {});
  }
}

/**
 * Verify multiple segments, starting with longest first
 */
export async function verifySegmentsByLength(
  audioPath: string,
  segments: AdSegment[],
  audioDuration: number,
  targetDuration: number,
  customClient?: GoogleGenerativeAI,
  customModel?: string
): Promise<AdSegment[]> {
  // Sort by duration (longest first)
  const sortedByDuration = [...segments].sort((a, b) => 
    (b.end - b.start) - (a.end - a.start)
  );
  
  const verifiedSegments: AdSegment[] = [];
  let currentTotalAdTime = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  let resultingDuration = audioDuration - currentTotalAdTime;
  
  console.log('[Verification] Starting:', JSON.stringify({
    targetDuration,
    currentDuration: resultingDuration,
    segmentCount: segments.length,
    totalAdTime: currentTotalAdTime
  }, null, 2));
  
  for (const segment of sortedByDuration) {
    // Check if we've reached acceptable duration
    if (resultingDuration >= targetDuration - DURATION_TOLERANCE) {
      console.log(`[Verification] Acceptable duration reached: ${resultingDuration}s (target: ${targetDuration}s ± ${DURATION_TOLERANCE}s)`);
      // Add remaining segments that weren't checked
      const remainingSegments = segments.filter(s => 
        !verifiedSegments.some(v => v.start === s.start && v.end === s.end) &&
        s !== segment
      );
      verifiedSegments.push(...remainingSegments);
      break;
    }
    
    // Verify this segment
    const verified = await verifyAdBreak(
      audioPath,
      segment,
      segments,
      audioDuration,
      customClient,
      customModel
    );
    
    if (verified) {
      verifiedSegments.push(verified);
    } else {
      // Segment rejected - update our duration calculation
      const segmentDuration = segment.end - segment.start;
      currentTotalAdTime -= segmentDuration;
      resultingDuration = audioDuration - currentTotalAdTime;
      console.log(`Rejected ${segmentDuration}s segment, new resulting duration: ${resultingDuration}s`);
    }
  }
  
  // Sort back by start time
  return verifiedSegments.sort((a, b) => a.start - b.start);
}