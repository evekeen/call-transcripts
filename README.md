# Fireflies Sales Intelligence Tool

A sales intelligence tool that integrates with Fireflies.ai to automatically organize call transcripts by client accounts and maintain searchable knowledge bases for sales preparation.

## Features

- 🔄 **Automatic Sync**: Pulls all transcripts from Fireflies.ai with rate limiting
- 🏢 **Smart Client Grouping**: Groups transcripts by email domains, custom rules, or manual assignment
- 🔍 **Intelligent Query**: Search and query transcript knowledge bases
- 📊 **API & Webhooks**: REST API with webhook support for real-time updates
- ⏰ **Scheduled Updates**: Automated syncing during business hours

## Quick Start

### Prerequisites

- Node.js 18+ 
- Fireflies.ai account with API access
- API key from https://app.fireflies.ai/integrations

### Installation

```bash
# Clone and install dependencies
cd fireflies-sales-intelligence
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your Fireflies API key
FIREFLIES_API_KEY=your_api_key_here
```

### Development

```bash
# Start in development mode
npm run dev

# Build for production
npm run build
npm start
```

## API Endpoints

### Sync Management
- `POST /sync/full` - Start full transcript sync
- `POST /sync/recent` - Sync recent transcripts (last 7 days)
- `GET /sync/status` - Get sync status and API usage

### Query Interface
- `POST /query` - Query transcripts with natural language
  ```json
  {
    "question": "What pain points did Acme Corp mention?",
    "client_account_id": "optional-client-id",
    "limit": 10
  }
  ```

### Client Management
- `GET /clients` - List all client accounts
- `GET /clients/:id/transcripts` - Get transcripts for specific client

### Webhooks
- `POST /webhook/fireflies` - Receive Fireflies webhook notifications

## Configuration

### Environment Variables

```bash
FIREFLIES_API_KEY=your_fireflies_api_key_here
DATABASE_PATH=./data/sales_intelligence.db
PORT=3000
LOG_LEVEL=info

# Rate limiting (Fireflies free plan = 50 requests/day)
POLL_INTERVAL_MINUTES=60
MAX_REQUESTS_PER_DAY=45

# Optional: LLM integration
OPENAI_API_KEY=your_openai_key_here
```

### Client Grouping Rules

The system supports three types of client grouping:

1. **Domain-based** (default): Groups by attendee email domains
2. **Title patterns**: Groups by meeting title regex patterns  
3. **Manual**: Manual transcript assignment

## Architecture

```
src/
├── api/           # REST API server
├── config/        # Configuration management
├── database/      # SQLite database layer
├── scheduler/     # Cron jobs for auto-sync
├── services/      # Business logic
│   ├── fireflies.ts      # Fireflies API client
│   ├── client-grouping.ts # Client assignment logic
│   ├── sync.ts           # Transcript synchronization
│   └── query.ts          # Query processing
└── types/         # TypeScript interfaces
```

## Rate Limiting

The system respects Fireflies API limits:
- **Free Plan**: 50 requests/day (default: 45 to leave buffer)
- **Pro Plan**: Higher limits (configure `MAX_REQUESTS_PER_DAY`)

Strategies used:
- API usage tracking in database
- Exponential backoff on errors
- Batch processing with delays
- Webhook support to reduce polling

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run type-check
```

## Deployment

The application is designed for cloud deployment:

- **Docker**: Containerized application
- **Cloud Functions**: Serverless deployment
- **VPS/Dedicated**: Traditional server deployment

Database persists to local SQLite file - use mounted volumes in containerized deployments.

## Troubleshooting

### Common Issues

1. **API Rate Limits**: Check `/sync/status` endpoint
2. **Missing Transcripts**: Verify Fireflies API key and permissions
3. **Client Grouping**: Review grouping rules in database

### Logs

Application logs include:
- Sync operations and errors
- API usage tracking
- Client assignment decisions
- Query processing results

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## License

MIT License - see LICENSE file for details.