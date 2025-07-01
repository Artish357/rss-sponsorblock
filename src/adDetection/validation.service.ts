// Main validation service for false positive detection
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AdSegment } from '../general/types';
import { getAudioDuration } from '../trimming/trimming.service';
import { detectAllAdBreaks } from './gemini.service';
import { verifySegmentsByLength } from './verification';
import { getCleanDuration, CleanDurationSource } from './cleanDuration.service';

export interface ValidationResult {
  segments: AdSegment[];
  validation?: {
    cleanDuration: number;
    cleanDurationSource: string;
    actualDuration: number;
    originalSegmentCount: number;
    verifiedSegmentCount: number;
    discrepancyBefore: number;
    discrepancyAfter: number;
  };
}

/**
 * Process episode with clean duration validation
 */
export async function processWithValidation(
  audioPath: string,
  episode: {
    duration?: string;
    transcriptUrl?: string;
  },
  customClient?: GoogleGenerativeAI,
  customModel?: string,
  onProgress?: (currentChunk: number, totalChunks: number, currentPosition: number) => void
): Promise<ValidationResult> {
  // Get actual duration of downloaded audio
  const actualDuration = await getAudioDuration(audioPath);
  
  // Get clean duration if available
  const cleanDurationSource = await getCleanDuration(episode);
  
  // Run normal ad detection
  const detectedAds: AdSegment[] = [];
  for await (const ad of detectAllAdBreaks(audioPath, customClient, customModel, onProgress)) {
    detectedAds.push(ad);
  }
  
  // If no clean duration available, return without validation
  if (!cleanDurationSource) {
    console.log('No clean duration source available, skipping validation');
    return { segments: detectedAds };
  }
  
  // Perform validation
  const validationResult = await validateAndRefine(
    audioPath,
    detectedAds,
    cleanDurationSource,
    actualDuration,
    customClient,
    customModel
  );
  
  return validationResult;
}

/**
 * Validate detected segments against clean duration and refine if needed
 */
async function validateAndRefine(
  audioPath: string,
  detectedAds: AdSegment[],
  cleanDurationSource: CleanDurationSource,
  actualDuration: number,
  customClient?: GoogleGenerativeAI,
  customModel?: string
): Promise<ValidationResult> {
  const cleanDuration = cleanDurationSource.value;
  
  // Calculate total ad time and resulting duration
  const totalAdTime = detectedAds.reduce((sum, ad) => sum + (ad.end - ad.start), 0);
  const resultingDuration = actualDuration - totalAdTime;
  const discrepancy = resultingDuration - cleanDuration;
  
  console.log(`Validation check:
    Clean duration: ${cleanDuration}s (${cleanDurationSource.type})
    Actual duration: ${actualDuration}s
    Total ads detected: ${totalAdTime}s
    Resulting duration: ${resultingDuration}s
    Discrepancy: ${discrepancy}s`);
  
  // Check if validation is needed
  if (Math.abs(discrepancy) <= 30) {
    console.log('Duration validation passed - within 30s tolerance');
    return {
      segments: detectedAds,
      validation: {
        cleanDuration,
        cleanDurationSource: cleanDurationSource.type,
        actualDuration,
        originalSegmentCount: detectedAds.length,
        verifiedSegmentCount: detectedAds.length,
        discrepancyBefore: discrepancy,
        discrepancyAfter: discrepancy
      }
    };
  }
  
  if (discrepancy > 30) {
    // Removing too much content - likely false positives
    console.log(`Removing ${discrepancy}s too much content - verifying segments`);
    
    const verifiedAds = await verifySegmentsByLength(
      audioPath,
      detectedAds,
      actualDuration,
      cleanDuration, // Target duration
      customClient,
      customModel
    );
    
    // Recalculate with verified segments
    const newTotalAdTime = verifiedAds.reduce((sum, ad) => sum + (ad.end - ad.start), 0);
    const newResultingDuration = actualDuration - newTotalAdTime;
    const newDiscrepancy = newResultingDuration - cleanDuration;
    
    console.log(`After verification:
      Original segments: ${detectedAds.length}
      Verified segments: ${verifiedAds.length}
      New discrepancy: ${newDiscrepancy}s`);
    
    // Check if verification improved the situation
    if (newDiscrepancy < -30) {
      // Still removing too much - use original audio
      console.log('Verification still removes too much content - using original audio');
      return {
        segments: [],
        validation: {
          cleanDuration,
          cleanDurationSource: cleanDurationSource.type,
          actualDuration,
          originalSegmentCount: detectedAds.length,
          verifiedSegmentCount: 0,
          discrepancyBefore: discrepancy,
          discrepancyAfter: 0
        }
      };
    }
    
    return {
      segments: verifiedAds,
      validation: {
        cleanDuration,
        cleanDurationSource: cleanDurationSource.type,
        actualDuration,
        originalSegmentCount: detectedAds.length,
        verifiedSegmentCount: verifiedAds.length,
        discrepancyBefore: discrepancy,
        discrepancyAfter: newDiscrepancy
      }
    };
  }
  
  // Not removing enough (discrepancy < -30)
  // This is acceptable - better to leave some ads than remove content
  console.log(`Not removing enough content (${Math.abs(discrepancy)}s of ads remain) - acceptable`);
  return {
    segments: detectedAds,
    validation: {
      cleanDuration,
      cleanDurationSource: cleanDurationSource.type,
      actualDuration,
      originalSegmentCount: detectedAds.length,
      verifiedSegmentCount: detectedAds.length,
      discrepancyBefore: discrepancy,
      discrepancyAfter: discrepancy
    }
  };
}