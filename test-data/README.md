# Testing

Automated test suite for the rss-sponsorblock application using Node.js built-in test runner.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch
```

## Test Coverage

### Security Tests (`tests/security.test.js`)
- ✅ URL generation never exposes original audio URLs
- ✅ Clean URL structure using only internal identifiers  
- ✅ Proper encoding of episode GUIDs to prevent path traversal
- ✅ Feed hash isolation prevents cross-feed access

### RSS Service Tests (`tests/rssService.test.js`)
- ✅ Secure URL generation without query parameters
- ✅ Special character handling in episode GUIDs
- ✅ URL replacement without exposing originals
- ✅ Graceful handling of malformed RSS feeds

### Storage Service Tests (`tests/storageService.test.js`)
- ✅ Database initialization
- ✅ Episode storage and retrieval
- ✅ Non-existent episode handling
- ✅ Episode data updates

## Manual Testing (Real Feeds)

For integration testing with real podcast feeds:

### Conspirituality
- **URL**: https://feeds.megaphone.fm/GLSS1122389842
- **Test**: `curl "localhost:3000/feed?url=https://feeds.megaphone.fm/GLSS1122389842"`

### Behind the Bastards  
- **URL**: https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/e5f91208-cc7e-4726-a312-ae280140ad11/d64f756d-6d5e-4fae-b24f-ae280140ad36/podcast.rss
- **Test**: `curl "localhost:3000/feed?url=https://www.omnycontent.com/..."`

## Security Verification

The test suite specifically validates that:
- Original audio URLs are never exposed in generated URLs
- All URLs use internal identifiers only (feedHash + episodeGuid)
- No sensitive information leaks in logs or browser history