// Verification prompts and schemas for validating detected ad segments
import { ResponseSchema, SchemaType } from '@google/generative-ai';

export const adBreakVerificationPrompt = `
You previously detected an ad break at {{START}}-{{END}} in this audio segment.
Now verify if this is truly an advertisement and refine the timestamps if needed.

Listen carefully for:
1. Exact moment when ad content begins
2. Exact moment when regular content resumes
3. Whether this is actually an ad or just sounds like one

Required indicators for TRUE ads:
- Explicit sponsorship language ("brought to you by", "sponsored by", "thanks to our sponsor")
- Product/service promotion with benefits, pricing, or special offers
- Call to action (website URL, promo code, "visit", "try", "sign up")
- Clear transition markers (music, host saying "back to the show", tone change)

DO NOT mark as ads:
- Editorial discussions about products or companies
- Host personal opinions or experiences without sponsorship
- News mentions or objective reviews
- Regular conversational content
- Host recommendations without sponsorship disclosure

Return one of:
1. Refined timestamps if it's an ad but timing was slightly off
2. null if this is NOT actually an advertisement
`;

export const adBreakVerificationSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    verified_ad_break: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        start: {
          type: SchemaType.STRING,
          description: 'Refined start time in MM:SS format relative to this chunk'
        },
        end: {
          type: SchemaType.STRING,
          description: 'Refined end time in MM:SS format relative to this chunk'
        },
        confidence: {
          type: SchemaType.NUMBER,
          description: 'Confidence score between 0.0 and 1.0'
        },
        adjustment_reason: {
          type: SchemaType.STRING,
          description: 'Explanation of why timestamps were adjusted or why segment was rejected'
        }
      },
      required: ['start', 'end', 'confidence', 'adjustment_reason']
    }
  },
  required: ['verified_ad_break']
};