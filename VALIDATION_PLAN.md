# Clean Duration Validation Plan

## Problem Statement
The AI ad detection system sometimes produces false positives, marking regular podcast content as advertisements. This leads to important content being removed from episodes.

## Solution
Use "clean duration" (the length of the podcast without dynamic ads) as a validation metric. By comparing the clean duration with the actual downloaded duration and the AI's detected ads, we can identify when the AI is removing too much content.

## Clean Duration Sources (Priority Order)

1. **RSS Duration** (`itunes:duration`) - Most straightforward and widely available source
2. **Podcast Transcripts** - Accurate when they exclude dynamic ads, but need parsing
3. **Chapter Files** - Often exclude dynamic ad insertions but less common

## Implementation Architecture

### Core Validation Flow
```
1. Download episode → Get actual duration
2. Extract clean duration from available sources
3. Run normal ad detection
4. Calculate: resultingDuration = actualDuration - totalAdTime
5. If resultingDuration < cleanDuration - 30s → Too much removed (false positives)
   - Re-verify segments starting with longest first
   - Continue until resultingDuration >= cleanDuration - 30s
   - If still too short after all verifications → Use original audio
6. If resultingDuration > cleanDuration + 30s → Not enough removed (acceptable)
   - Log but proceed with detected segments
7. Otherwise → Accept detected segments as is
```

### Key Components

#### 1. Clean Duration Extraction Service
- Parse multiple duration formats (HH:MM:SS, seconds, etc.)
- Extract from transcripts (SRT, VTT, JSON)
- Handle chapter files
- Provide confidence scores for each source

#### 2. Chunk Boundary Calculator
- Ensure chunks capture entire ad breaks
- Avoid overlapping with other detected segments
- Respect maximum chunk duration (30 minutes)
- Include context padding (30s before/after)

#### 3. Verification Service
- Use structured prompts requiring strong ad indicators
- Convert timestamps to chunk-relative for AI
- Convert back to absolute after verification
- Track adjustment reasons

#### 4. Validation Logic
- Accept if resulting duration within 30s of clean duration
- If too short (removing too much):
  - Re-verify segments starting with longest
  - Stop when acceptable length reached
  - Fallback to original if still too short
- If too long (not removing enough):
  - Log but accept (better to keep content than remove it)

### Database Schema Updates

```sql
ALTER TABLE episodes ADD COLUMN clean_duration INTEGER;
ALTER TABLE episodes ADD COLUMN clean_duration_source TEXT;
ALTER TABLE episodes ADD COLUMN transcript_url TEXT;
```

Note: We don't store `actual_duration` since it varies with dynamic ad insertion. Each download could have different duration based on which ads are inserted at that time.

### File Structure

```
src/adDetection/
├── validation.service.ts     # Main validation orchestration
├── cleanDuration.service.ts  # Duration extraction logic
├── verification.ts           # Ad segment verification
├── prompts/
│   └── verification.ts       # Verification prompt & schema
└── types/validation.ts       # TypeScript interfaces
```

## Success Criteria

1. False positive rate reduced by >80%
2. No increase in missed ads (false negatives)
3. Processing time increase <20%
4. Clear logging for debugging validation decisions

## Edge Cases

1. No clean duration available → Skip validation
2. Multiple ad breaks near boundaries → Smart chunk splitting
3. Very long ad breaks → Ensure chunks don't exceed 30 minutes
4. Transcripts with ads included → Detect and handle appropriately

## Testing Strategy

1. Collect sample episodes with known clean durations
2. Compare validation results with manual verification
3. Test with various podcast formats (interview, narrative, news)
4. Measure false positive reduction rates

## Future Enhancements

1. Machine learning on validation results
2. Per-podcast validation thresholds
3. User feedback integration
4. Automatic transcript fetching from platforms

## Implementation Progress

### Phase 1: Database & Data Model ✅
- [x] Create validation plan document
- [x] Create database migration for new columns
- [x] Update Episode type interface
- [x] Update episode model functions

### Phase 2: Clean Duration Extraction ✅
- [x] Create cleanDuration.service.ts
- [x] Implement parseItunesDuration function
- [x] Add duration extraction to feed service
- [x] Create transcript URL extraction

### Phase 3: Verification System ✅
- [x] Create verification.ts with prompt and schema
- [x] Implement chunk boundary calculator
- [x] Create verifyAdBreak function
- [x] Handle timestamp conversions

### Phase 4: Validation Integration ✅
- [x] Create validation.service.ts
- [x] Implement validation logic
- [x] Add longest-segment-first verification
- [x] Integrate into episode processing

### Phase 5: Testing & Refinement ✅
- [x] Test with sample podcasts
- [x] Measure false positive reduction
- [x] Adjust thresholds based on results
- [x] Document findings

## Test Results

Successfully tested with "Behind the Bastards" podcast:
- Episode 1: Clean duration matched, no verification needed
- Episode 2: Detected false positives (118s discrepancy), verification reduced segments from 3 to 2
- System correctly identifies when too much content would be removed
- Verification process successfully reduces false positives
