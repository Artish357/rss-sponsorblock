// Customizable prompt for Gemini ad detection

export const adDetectionPrompt = `
Analyze this podcast audio and identify advertisement segments.

Return a JSON response with this structure:
{
  "adSegments": [
    {
      "start": "00:02:15",
      "end": "00:03:45",
      "confidence": 0.95,
      "type": "host-read"
    }
  ]
}

Time format: HH:MM:SS
Types: "host-read", "pre-roll", "mid-roll", "post-roll", "sponsor-mention"
Confidence: 0.0 to 1.0

Identify segments that are clearly advertisements, sponsor messages, or promotional content.
Be conservative - only mark segments you're confident are ads.
`;