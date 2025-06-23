# Test Data

RSS feeds for testing the podmirror application.

## Test Feeds

### Conspirituality
- **RSS URL**: https://feeds.megaphone.fm/GLSS1122389842
- **Description**: Podcast about New Age cults, wellness grifters, and conspiracy theories

### Behind the Bastards
- **RSS URL**: https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/e5f91208-cc7e-4726-a312-ae280140ad11/d64f756d-6d5e-4fae-b24f-ae280140ad36/podcast.rss
- **Description**: History podcast about bad people and their crimes

## Usage

These feeds can be used to test RSS parsing and URL replacement functionality:

```bash
# Test RSS fetching
curl "http://localhost:3000/feed?url=https://feeds.megaphone.fm/GLSS1122389842"

# Test audio proxying (after implementation)
curl "http://localhost:3000/audio/{feedHash}/{episodeGuid}.mp3"
```

Note: Full RSS files are not stored in git to avoid potential secrets in feed content.
Test by fetching feeds directly from URLs above.