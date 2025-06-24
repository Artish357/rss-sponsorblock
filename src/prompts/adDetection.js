// Customizable prompts and schemas for two-step Gemini ad detection

export const transcriptPrompt = `
Give me a list of ad blocks in this episode. Identify their start and end times
`;

export const firstAdBreakPrompt = `
Analyze this audio segment and find the FIRST ad break only.

An ad break is a continuous section of advertisements (one or more sponsors back-to-back) that interrupts the main content.

Identify:
1. When the first advertisement begins (any sponsor, promo, or ad)
2. When the main podcast content resumes after ALL consecutive ads

Important:
- If multiple sponsors play consecutively, they are part of the SAME ad break
- The break ends when regular podcast content resumes
- Return null if no ad break is found in this segment

Return format:
{
  "ad_break": {
    "start": "HH:MM:SS",
    "end": "HH:MM:SS",
    "confidence": 0.0-1.0,
    "description": "Brief description of the ads and how you identified content resumption"
  }
}

Or if no ads found:
{
  "ad_break": null
}
`;

export const adDetectionPrompt = `
Based on the timestamped transcript you just provided, identify all advertisement and sponsor segments.

Look for:
- Host-read sponsor messages
- Pre-roll/mid-roll/post-roll ads
- Product placements
- Promotional content
- Sponsor acknowledgments

Return a JSON response with this exact structure:
{
  "ad_segments": [
    {
      "start": "HH:MM:SS",
      "end": "HH:MM:SS",
      "confidence": 0.0-1.0,
      "type": "host-read|pre-roll|mid-roll|post-roll|sponsor-mention",
      "description": "Brief description of the ad content"
    }
  ]
}

Be conservative - only mark segments you're confident are advertisements.
Use the exact timestamps from the transcript.
Return ONLY valid JSON, no markdown code blocks or other text.
`;

// Response schema for structured output
export const adSegmentSchema = {
  type: "object",
  properties: {
    ad_segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Start time in HH:MM:SS format"
          },
          end: {
            type: "string",
            description: "End time in HH:MM:SS format"
          },
          confidence: {
            type: "number",
            description: "Confidence score between 0.0 and 1.0"
          },
          type: {
            type: "string",
            enum: ["host-read", "pre-roll", "mid-roll", "post-roll", "sponsor-mention"],
            description: "Type of advertisement"
          },
          description: {
            type: "string",
            description: "Brief description of the ad content"
          }
        },
        required: ["start", "end", "confidence", "type", "description"]
      }
    }
  },
  required: ["ad_segments"]
};

// Unified schema that can handle both transcript and ad detection responses
export const unifiedResponseSchema = {
  type: "object",
  properties: {
    response_type: {
      type: "string",
      enum: ["transcript", "ad_detection"],
      description: "Type of response"
    },
    transcript: {
      type: "string",
      description: "Timestamped transcript of the podcast"
    },
    ad_segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Start time in HH:MM:SS format"
          },
          end: {
            type: "string",
            description: "End time in HH:MM:SS format"
          },
          confidence: {
            type: "number",
            description: "Confidence score between 0.0 and 1.0"
          },
          type: {
            type: "string",
            enum: ["host-read", "pre-roll", "mid-roll", "post-roll", "sponsor-mention"],
            description: "Type of advertisement"
          },
          description: {
            type: "string",
            description: "Brief description of the ad content"
          }
        },
        required: ["start", "end", "confidence", "type", "description"]
      }
    }
  },
  required: ["response_type"]
};

// Schema for single ad break detection
export const firstAdBreakSchema = {
  type: "object",
  properties: {
    ad_break: {
      type: "object",
      nullable: true,
      properties: {
        start: { 
          type: "string",
          description: "Start time of ad break in HH:MM:SS format"
        },
        end: { 
          type: "string",
          description: "End time of ad break when content resumes in HH:MM:SS format"
        },
        confidence: { 
          type: "number",
          description: "Confidence score between 0.0 and 1.0"
        },
        description: { 
          type: "string",
          description: "Brief description of the ad break content"
        }
      },
      required: ["start", "end", "confidence", "description"]
    }
  },
  required: ["ad_break"]
};