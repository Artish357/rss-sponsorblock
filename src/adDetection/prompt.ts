// Customizable prompts and schemas for two-step Gemini ad detection

import { ResponseSchema, SchemaType } from '@google/generative-ai';

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
- Sometimes the ad break is announced by hosts or is prefaced by an audio bumper. That should help you identify them 

Return format:
{
  "ad_break": {
    "start": "MM:SS",
    "end": "MM:SS",
    "confidence": 0.0-1.0
  }
}

Or if no ads found:
{
  "ad_break": null
}
`;

// Schema for single ad break detection
export const firstAdBreakSchema: ResponseSchema = {
  type:  SchemaType.OBJECT,
  properties: {
    ad_break: {
      type:  SchemaType.OBJECT,
      nullable: true,
      properties: {
        start: {
          type:  SchemaType.STRING,
          description: 'Start time of ad break in MM:SS format'
        },
        end: {
          type:  SchemaType.STRING,
          description: 'End time of ad break when content resumes in MM:SS format'
        },
        confidence: {
          type:  SchemaType.NUMBER,
          description: 'Confidence score between 0.0 and 1.0'
        }
      },
      required: ['start', 'end', 'confidence']
    }
  },
  required: ['ad_break']
};
