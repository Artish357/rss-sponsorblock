# TypeScript Migration Plan

## Overview
This document tracks the migration of the RSS SponsorBlock project from JavaScript to TypeScript, including the setup of ESLint for code quality.

## Current Status
- [ ] Phase 1: ESLint Setup
- [ ] Phase 2: TypeScript Configuration
- [ ] Phase 3: Code Migration
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

## Phase 1: ESLint Setup ⏳

### Tasks
1. Install ESLint and plugins:
   - eslint
   - @eslint/js
   - @typescript-eslint/eslint-plugin
   - @typescript-eslint/parser
   - eslint-plugin-node

2. Create eslint.config.js with:
   - ES module support
   - Node.js environment
   - TypeScript preparation
   - Recommended rules

3. Add npm scripts:
   - `npm run lint`
   - `npm run lint:fix`

4. Fix initial linting issues

## Phase 2: TypeScript Configuration ⏳

### Tasks
1. Install TypeScript and types:
   - typescript
   - @types/node
   - @types/express
   - @types/fluent-ffmpeg
   - ts-node
   - tsx (for development)

2. Create tsconfig.json:
   - Target: ES2022
   - Module: ES2022
   - Module Resolution: Node
   - Allow JS (for gradual migration)
   - Strict mode enabled
   - Source maps

3. Add TypeScript scripts:
   - `npm run build`
   - `npm run dev` (using tsx)
   - `npm run typecheck`

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

### 2025-01-25
- Project uses ES modules throughout (type: "module" in package.json)
- No existing TypeScript or ESLint configuration
- Uses Node.js native test runner
- All services follow consistent patterns
- Knex.js for database operations (good TypeScript support)

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
- [ ] src/services/storageService.js
- [ ] src/services/audioProcessor.js
- [ ] src/services/audioDownloadService.js
- [ ] src/services/geminiService.js
- [ ] src/services/rssService.js
- [ ] src/services/audioProcessingService.js
- [ ] tests/mocks/testHelpers.js
- [ ] tests/mocks/mockServices.js
- [ ] (10 test files...)

### Configuration Files Created
- [ ] eslint.config.js
- [ ] tsconfig.json
- [ ] .eslintignore (if needed)

### Scripts Added
- [ ] lint
- [ ] lint:fix
- [ ] build
- [ ] dev
- [ ] typecheck

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