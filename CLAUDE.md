# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
npm run web              # Start web interface server on port 3000
npm run web:build        # Build and run web server in production mode 
npm test                 # Run all unit tests (98 total)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run type-check       # TypeScript type checking without compilation
npm run lint            # ESLint code quality checks
npm run build           # Compile TypeScript to JavaScript
```

### Testing Specific Components
```bash
npm test -- --testPathPattern=gongClient      # Test specific integration
npm test -- --testPathPattern=transcriptRepo  # Test database layer
npm test src/integrations/gong/              # Test entire Gong integration
```

### Platform Testing (after npm run build)
```bash
# Test platform connectivity individually
node -e "const {GongClient} = require('./dist/src/integrations/gong/gongClient'); const client = new GongClient('gong-api-credentials'); client.authenticate().then(() => client.testConnection()).then(r => console.log('Gong:', r)).catch(console.error);"
```

## Architecture Overview

This is a **multi-platform sales intelligence system** that captures and organizes call transcripts from various platforms (Gong, Clari, Fireflies, Fathom, Otter) into a unified searchable knowledge base.

### Core Architecture Patterns

**Platform Adapter Pattern**: All integrations implement the `PlatformAdapter` interface, allowing uniform access to different call recording platforms:
- `src/integrations/base/platformAdapter.ts` - Base interface defining common operations
- `src/integrations/platformFactory.ts` - Factory for creating platform-specific clients
- Each platform has its own client (`gongClient.ts`, `clariClient.ts`, etc.) with platform-specific types

**Multi-Layer Data Flow**:
1. **Platform APIs** → Platform-specific clients handle authentication and API calls
2. **Webhook Processing** → AWS Lambda functions process real-time webhook events  
3. **SQS Queues** → Decouple webhook ingestion from transcript processing
4. **Database Layer** → Supabase with full-text search and account association
5. **Web Interface** → Express server with REST API and responsive UI

**Authentication Strategy**: 
- Primary: Environment variables (development)
- Fallback: AWS Secrets Manager (production)
- Platform-specific: Gong supports both OAuth and Basic Auth, others use API keys

### Key Components

**Database Schema** (`src/database/schemas/transcript.sql`):
- `transcripts` table with full-text search via `tsvector`
- `transcript_segments` for speaker-level data
- `account_association_rules` for automatic client grouping
- Row Level Security (RLS) policies for multi-tenant access

**Web API** (`src/api/server.ts`):
- Multi-platform endpoints: `/api/{platform}/calls` and `/api/{platform}/transcripts/{id}`
- Stored transcript search: `/api/transcripts` with filtering
- Platform validation and unified response format
- Serves static web interface from `/public`

**Integration Clients**: Each platform client handles:
- Authentication (OAuth/API key/Basic Auth)
- Rate limiting and retry logic
- Data normalization to common `CallMetadata` and `Transcript` interfaces
- Platform-specific API quirks (e.g., Gong uses POST for transcripts)

## Configuration

### Environment Setup
Copy `.env.example` to `.env` and configure:
- **Platform Enablement**: Set `{PLATFORM}_ENABLED=true` 
- **Authentication**: Choose AWS Secrets Manager OR direct environment variables
- **Database**: Supabase URL and service key for stored transcripts

### Platform-Specific Auth

**Gong**: Supports two methods (choose one)
```bash
# Method 1: Basic Auth (recommended)
GONG_API_KEY=your_api_key
GONG_API_SECRET=your_api_secret

# Method 2: OAuth
GONG_CLIENT_ID=your_client_id  
GONG_CLIENT_SECRET=your_client_secret
```

**Others**: Standard API key authentication
```bash
FIREFLIES_API_KEY=your_key
CLARI_API_KEY=your_key
```

## Development Guidelines

### Adding New Platform Integration
1. Create new client in `src/integrations/{platform}/`
2. Implement `PlatformAdapter` interface
3. Add platform-specific types in `types.ts`
4. Update `PlatformFactory` to include new platform
5. Add comprehensive tests following existing patterns

### Type Safety
- All platform APIs use **strongly-typed interfaces** based on actual API responses
- No flexible/optional typing - exact field specifications required
- Platform responses are normalized to common interfaces (`CallMetadata`, `Transcript`)

### Testing Strategy
- **Unit tests**: Mock all external dependencies (AWS, Supabase, platform APIs)
- **Integration tests**: Test platform clients with `*.integration.test.ts` files  
- **E2E verification**: Use npm scripts to test live platform connectivity
- **Database tests**: Use Supabase test helpers for repository layer

### Lambda Functions
Located in `src/lambdas/`:
- `{platform}Webhook.ts` - Handle incoming webhook events
- `transcriptProcessor.ts` - Process transcript records from SQS
- All functions include comprehensive error handling and retry logic

### Common Patterns

**Lazy Loading**: Platform clients are initialized on-demand to avoid startup failures
**Singleton Factory**: `PlatformFactory` caches client instances per platform/credentials
**Graceful Degradation**: System works with subset of platforms if others fail
**Unified Error Handling**: All platform clients normalize errors to common format

## Web Interface

The web interface (`public/index.html`) is a single-page application that:
- Supports all configured platforms via dropdown selector
- Provides date filtering and call limit controls
- Displays calls as clickable cards with transcript modals
- Shows both live API calls and stored transcripts from database
- Responsive design works on desktop and mobile

Start with `npm run web` and access at `http://localhost:3000`

## Important Implementation Details

- **Gong API**: Uses POST `/calls/transcript` endpoint, not GET `/calls/{id}/transcript`
- **Timestamp Handling**: Gong returns ISO strings, not Unix timestamps as documented
- **Authentication Fallback**: Always try AWS Secrets Manager first, fall back to env vars
- **Rate Limits**: Each platform client implements platform-specific rate limiting
- **Full-Text Search**: Supabase uses PostgreSQL `tsvector` for transcript search
- **Account Association**: Domain-based rules automatically group calls by client company


## Git and Commits
- Never mention Claude Code in a commit message

## Working with code

- Always run compilation and linter (e.g. npm run build, npm run lint) and fix errors and warnings
- Always run unit tests and make sure there are no new bugs. Fix something if API changed.
- Add new tests for new features
- Mock external API's
- Intead of mocking Supabase, use local temporary DB like sqlite for tests. Make sure to clean the DB before and after tests