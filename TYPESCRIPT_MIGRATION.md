# TypeScript Migration Plan

## Overview
This document tracks the migration of the RSS SponsorBlock project from JavaScript to TypeScript, including the setup of ESLint for code quality.

## Current Status
- [x] Phase 1: ESLint Setup ✅
- [x] Phase 2: TypeScript Configuration ✅
- [ ] Phase 3: Code Migration 🚧
- [ ] Phase 4: Build Pipeline

## Project Structure Analysis

### JavaScript Files to Migrate
```
src/
├── index.js
├── prompts/
│   └── adDetection.js
└── services/
    ├── audioDownloadService.js
    ├── audioProcessingService.js
    ├── audioProcessor.js
    ├── geminiService.js
    ├── rssService.js
    └── storageService.js

tests/
├── audioDownloadService.test.js
├── audioProcessingService.test.js
├── audioProcessor.test.js
├── geminiService.integration.test.js
├── geminiService.test.js
├── index.test.js
├── integration.test.js
├── rssService.test.js
├── security.test.js
├── storageService.test.js
└── mocks/
    ├── mockServices.js
    └── testHelpers.js
```

### Current Dependencies Requiring Types
- express
- knex
- sqlite3
- fast-xml-parser
- node-fetch
- dotenv
- @google/generative-ai
- fluent-ffmpeg

### Development Dependencies
- Node.js native test runner (no external test framework)

## Phase 1: ESLint Setup ✅ COMPLETED

**Completed 2025-01-25**

### Tasks ✅
1. ✅ Install ESLint and plugins:
   - eslint, @eslint/js, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, globals

2. ✅ Create eslint.config.js with:
   - Modern flat config format
   - Node.js and ES2022 globals
   - TypeScript-ready configuration
   - Simplified but effective rules focusing on code quality

3. ✅ Add npm scripts:
   - `npm run lint`
   - `npm run lint:fix`

4. ✅ Fix initial linting issues:
   - Fixed 30+ unused variable issues
   - Used underscore prefix pattern for intentionally unused variables

5. ✅ Set up pre-commit hooks:
   - Added husky for git hooks
   - Pre-commit runs linter and tests

## Phase 2: TypeScript Configuration ✅ COMPLETED

**Completed 2025-01-25**

### Tasks ✅
1. ✅ Install TypeScript and types:
   - typescript, @types/node, @types/express, @types/fluent-ffmpeg, tsx

2. ✅ Create tsconfig.json:
   - Target: ES2022 for modern Node.js compatibility
   - Module: ES2022 with Node resolution
   - Allow JS enabled for gradual migration
   - Strict mode enabled for type safety
   - Source maps and declarations enabled
   - Proper include/exclude configuration

3. ✅ Add TypeScript scripts:
   - `npm run build` (compile with tsc)
   - `npm run dev` (development with tsx watch)
   - `npm run typecheck` (type checking without emit)
   - `npm run test:ts` (for future TypeScript tests)

4. ✅ Configure build pipeline:
   - Added dist/ to .gitignore
   - Verified TypeScript compilation works
   - Tested development server with tsx

## Phase 3: Migration Strategy ⏳

### Order of Migration
1. **Type Definitions First**
   - Create .d.ts files for service interfaces
   - Define shared types

2. **Services (Bottom-up)**
   - storageService.js → storageService.ts
   - audioProcessor.js → audioProcessor.ts
   - audioDownloadService.js → audioDownloadService.ts
   - geminiService.js → geminiService.ts
   - rssService.js → rssService.ts
   - audioProcessingService.js → audioProcessingService.ts

3. **Entry Points**
   - prompts/adDetection.js → adDetection.ts
   - index.js → index.ts

4. **Tests**
   - Migrate test helpers first
   - Then individual test files
   - May need to evaluate test runner compatibility

### Migration Checklist per File
- [ ] Rename .js to .ts
- [ ] Add type annotations
- [ ] Update imports to use .js extensions
- [ ] Fix type errors
- [ ] Update corresponding tests
- [ ] Verify functionality

## Phase 4: Build Pipeline ⏳

### Tasks
1. Configure build output:
   - Output directory: `dist/`
   - Copy non-TS files (if any)
   - Update .gitignore

2. Update package.json scripts:
   - `start` to use compiled output
   - `dev` for development with tsx
   - `build` for production

3. CI/CD considerations:
   - Build step before deployment
   - Type checking in CI
   - Linting in CI

## Notes and Discoveries

### 2025-01-25 - Initial Analysis
- Project uses ES modules throughout (type: "module" in package.json)
- No existing TypeScript or ESLint configuration
- Uses Node.js native test runner
- All services follow consistent patterns
- Knex.js for database operations (good TypeScript support)

### 2025-01-25 - Phase 1 Complete
- ✅ ESLint setup with modern flat config completed
- Used simplified config focusing on code quality over style
- Leveraged `globals` package for proper Node.js/ES2022 environment detection
- Fixed all 30+ linting issues by prefixing unused vars with underscore
- Set up Husky pre-commit hooks running linter + tests
- All tests passing, codebase is lint-clean and ready for TypeScript

### 2025-01-25 - Phase 2 Complete
- ✅ TypeScript configuration completed successfully
- Installed typescript, @types/node, @types/express, @types/fluent-ffmpeg, tsx
- Created tsconfig.json with ES2022 target, strict mode, and gradual migration support
- Added comprehensive npm scripts for build, dev, and type checking
- Verified TypeScript compilation works (builds all .js files to dist/)
- Tested tsx development server for hot reloading
- Ready to begin gradual migration to TypeScript

### 2025-01-25 - Phase 3 In Progress: Storage and Audio Processing Migration
- ✅ Created shared type definitions in `src/types/index.ts`
- ✅ Successfully migrated `storageService.js` to TypeScript
- ✅ Implemented clean type architecture using utility types:
  - `EpisodeData` = `Partial<Pick<Episode, ...>>` for operations
  - `EpisodeRow` = `Omit<Episode, 'ad_segments'> & { ad_segments: string }` for DB
- ✅ Updated test runner to use tsx for gradual migration support
- ✅ Successfully migrated `audioProcessor.js` to TypeScript with full type safety
- ✅ Added `AdSegmentInput` interface for audio processing operations
- ✅ All tests passing for both storage and audio processing services
- Both services now have complete type safety with proper interfaces

## Challenges and Solutions

### Challenge 1: ES Modules with TypeScript
**Solution**: Configure TypeScript to output ES modules and use .js extensions in imports

### Challenge 2: Test Runner Compatibility
**Solution**: Node.js test runner should work with TypeScript via tsx loader

### Challenge 3: Gradual Migration
**Solution**: Enable allowJs in tsconfig.json, migrate file by file

## Progress Tracking

### Files Migrated
- [ ] src/index.js
- [ ] src/prompts/adDetection.js
- [x] src/services/storageService.js → storageService.ts ✅
- [x] src/services/audioProcessor.js → audioProcessor.ts ✅
- [ ] src/services/audioDownloadService.js
- [ ] src/services/geminiService.js
- [ ] src/services/rssService.js
- [ ] src/services/audioProcessingService.js
- [ ] tests/mocks/testHelpers.js
- [ ] tests/mocks/mockServices.js
- [ ] (10 test files...)

### Configuration Files Created
- [x] eslint.config.js ✅
- [x] .husky/pre-commit ✅
- [x] tsconfig.json ✅
- [x] Updated .gitignore ✅

### Scripts Added
- [x] lint ✅
- [x] lint:fix ✅
- [x] prepare (husky) ✅
- [x] build ✅
- [x] dev ✅
- [x] typecheck ✅
- [x] test:ts ✅

## Commands Reference

```bash
# Linting
npm run lint
npm run lint:fix

# TypeScript
npm run typecheck
npm run build

# Development
npm run dev

# Testing
npm test
```