// Main validation service for false positive detection
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AdSegment } from '../general/types';
import { getAudioDuration } from '../trimming/trimming.service';
import { detectAllAdBreaks } from './gemini.service';
import { verifySegmentsByLength } from './verification';
import { CleanDurationSource } from './cleanDuration.service';

// Configuration from environment
const DURATION_TOLERANCE = parseInt(process.env.AD_DURATION_TOLERANCE_SECONDS || '30', 10);

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
  cleanDuration?: number,
  cleanDurationSource?: CleanDurationSource,
  customClient?: GoogleGenerativeAI,
  customModel?: string,
  onProgress?: (currentChunk: number, totalChunks: number, currentPosition: number) => void
): Promise<ValidationResult> {
  // Get actual duration of downloaded audio
  const actualDuration = await getAudioDuration(audioPath);

  // Run normal ad detection
  const detectedAds: AdSegment[] = [];
  for await (const ad of detectAllAdBreaks(audioPath, customClient, customModel, onProgress)) {
    detectedAds.push(ad);
  }
  
  // If no clean duration available, return without validation
  if (!cleanDurationSource || !cleanDuration) {
    console.log('[Validation] No clean duration source available, skipping validation');
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

function calculateDiscrepancy(adSegments: AdSegment[], actualDuration: number, cleanDuration: number) {
  // Calculate total ad time and resulting duration
  const totalAdTime = adSegments.reduce((sum, ad) => sum + (ad.end - ad.start), 0);
  const resultingDuration = actualDuration - totalAdTime;
  return cleanDuration - resultingDuration;
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
  const discrepancy = calculateDiscrepancy(detectedAds, actualDuration, cleanDuration);
  
  console.log('[Validation] Check:', JSON.stringify({
    cleanDuration,
    cleanDurationSource: cleanDurationSource.type,
    actualDuration,
    discrepancy
  }, null, 2));
  
  // Check if validation is needed
  if (discrepancy <= DURATION_TOLERANCE) {
    console.log(`[Validation] Duration validation passed - within ${DURATION_TOLERANCE}s tolerance`);
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
  
  if (discrepancy > DURATION_TOLERANCE) {
    // Removing too much content - likely false positives
    console.log(`[Validation] WARNING: Removing ${discrepancy}s too much content - verifying segments (${detectedAds.length} segments)`);
    
    const verifiedAds = await verifySegmentsByLength(
      audioPath,
      detectedAds,
      actualDuration,
      cleanDuration, // Target duration
      customClient,
      customModel
    );
    const newDiscrepancy = calculateDiscrepancy(verifiedAds, actualDuration, cleanDuration);
    
    console.log('[Validation] Verification complete:', JSON.stringify({
      originalSegments: detectedAds.length,
      verifiedSegments: verifiedAds.length,
      newDiscrepancy
    }, null, 2));
    
    // Check if verification improved the situation
    if (newDiscrepancy > DURATION_TOLERANCE) {
      // Still removing too much - use original audio
      console.log(`[Validation] WARNING: Verification still removes too much content (${newDiscrepancy}s) - using original audio`);
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
  
  // Not removing enough
  // This is acceptable - better to leave some ads than remove content
  console.log(`[Validation] Not removing enough content (${Math.abs(discrepancy)}s of ads remain) - acceptable`);
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