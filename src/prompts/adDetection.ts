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
          description: 'Start time of ad break in HH:MM:SS format'
        },
        end: {
          type:  SchemaType.STRING,
          description: 'End time of ad break when content resumes in HH:MM:SS format'
        },
        confidence: {
          type:  SchemaType.NUMBER,
          description: 'Confidence score between 0.0 and 1.0'
        },
        description: {
          type:  SchemaType.STRING,
          description: 'Brief description of the ad break content'
        }
      },
      required: ['start', 'end', 'confidence', 'description']
    }
  },
  required: ['ad_break']
};
