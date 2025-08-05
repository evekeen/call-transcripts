# Multi-Platform Sales Intelligence Tool

A comprehensive sales intelligence system that automatically captures, processes, and organizes call transcripts from multiple platforms (Gong, Clari, Fireflies) to maintain searchable knowledge bases for sales preparation.

## 🚀 Features

- 🔄 **Multi-Platform Integration**: Supports Gong, Clari, and Fireflies APIs
- 🏢 **Smart Account Association**: Automatic client grouping using domain-based logic
- 🔍 **Full-Text Search**: Advanced search across all transcripts and segments
- 📊 **Webhook Support**: Real-time transcript processing via webhooks
- ☁️ **Serverless Architecture**: AWS Lambda functions with SQS queues
- 🛡️ **Security**: Row Level Security policies and audit trails
- 📈 **Rate Limiting**: Respects platform-specific API limits
- 🧪 **Comprehensive Testing**: 64+ unit tests with full coverage

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Platform APIs │    │   AWS Lambda     │    │   Supabase DB   │
│                 │    │                  │    │                 │
│ • Gong          │───▶│ • Webhook        │───▶│ • Transcripts   │
│ • Clari         │    │   Handlers       │    │ • Segments      │
│ • Fireflies     │    │ • Transcript     │    │ • Accounts      │
│                 │    │   Processor      │    │ • Full-text     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌──────────────────┐             │
                       │   SQS Queues     │             │
                       │                  │             │
                       │ • Processing     │◀────────────┘
                       │ • Dead Letter    │
                       └──────────────────┘
```

## 📋 Prerequisites

- **Node.js** 18+
- **AWS CLI** configured with appropriate permissions
- **Supabase** account and project
- **Platform API Keys**:
  - Gong: OAuth2 credentials
  - Clari: Bearer token and org password
  - Fireflies: GraphQL API key

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd fireflies-sales-intelligence
npm install
```

### 2. Environment Configuration

```bash
# Copy the environment template
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Platform API Keys
GONG_CLIENT_ID=your-gong-client-id
GONG_CLIENT_SECRET=your-gong-client-secret
GONG_WEBHOOK_SECRET=your-webhook-secret

CLARI_API_TOKEN=your-clari-bearer-token
CLARI_ORG_PASSWORD=your-org-password
CLARI_WEBHOOK_SECRET=your-webhook-secret

FIREFLIES_API_KEY=your-fireflies-graphql-key
FIREFLIES_WEBHOOK_SECRET=your-webhook-secret

# AWS Configuration (if deploying)
AWS_REGION=us-east-1
TRANSCRIPT_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
```

### 3. Database Setup

Create the Supabase database schema:

```bash
# Apply the database schema
psql -h your-supabase-host -U postgres -d postgres -f src/database/schemas/transcript.sql
```

Or copy the SQL from `src/database/schemas/transcript.ts` and run it in your Supabase SQL editor.

### 4. AWS Infrastructure (Optional - for production)

Deploy the AWS CDK stack:

```bash
# Install AWS CDK
npm install -g aws-cdk

# Bootstrap CDK (first time only)
cd infrastructure
cdk bootstrap

# Deploy the stack
cdk deploy GongIntegrationStack
```

## 🚀 Quick Start & Testing

### 1. Run Unit Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testPathPattern=gongClient
```

### 2. Test Platform Integrations

```bash
# Test Gong client
node -e "
const { GongClient } = require('./dist/src/integrations/gong/gongClient');
const client = new GongClient();
client.testConnection().then(result => console.log('Gong:', result));
"

# Test Clari client
node -e "
const { ClariClient } = require('./dist/src/integrations/clari/clariClient');
const client = new ClariClient();
client.testConnection().then(result => console.log('Clari:', result));
"

# Test Fireflies client
node -e "
const { FirefliesClient } = require('./dist/src/integrations/fireflies/firefliesClient');
const client = new FirefliesClient();
client.testConnection().then(result => console.log('Fireflies:', result));
"
```

### 3. Test Database Connection

```bash
node -e "
const { TranscriptRepository } = require('./dist/src/database/repositories/transcriptRepository');
const repo = new TranscriptRepository();
repo.getProcessingStats().then(stats => console.log('DB Stats:', stats));
"
```

### 4. Test Webhook Endpoints (Local Development)

```bash
# Install serverless framework for local testing
npm install -g serverless

# Start local development server
serverless offline start

# Test webhook endpoints
curl -X POST http://localhost:3000/webhook/gong \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "CALL_PROCESSING_COMPLETED",
    "callId": "test-call-123",
    "timestamp": "2023-01-01T10:00:00Z",
    "workspaceId": "workspace-123"
  }'
```

### 5. End-to-End Test Scenario

Create a test script to verify the complete flow:

```javascript
// test-e2e.js
const { PlatformFactory } = require('./dist/src/integrations/platformFactory');
const { TranscriptRepository } = require('./dist/src/database/repositories/transcriptRepository');
const { AccountAssociationService } = require('./dist/src/services/accountAssociation');

async function testE2E() {
  try {
    console.log('🧪 Starting End-to-End Test...');
    
    // 1. Test platform clients
    const gongClient = PlatformFactory.createClient('gong');
    const isGongConnected = await gongClient.testConnection();
    console.log('✅ Gong connection:', isGongConnected);
    
    // 2. Test database
    const repository = new TranscriptRepository();
    const stats = await repository.getProcessingStats();
    console.log('✅ Database stats:', stats);
    
    // 3. Test account association
    const associationService = new AccountAssociationService(repository);
    console.log('✅ Account association service initialized');
    
    // 4. Test transcript retrieval (if API keys are valid)
    if (isGongConnected) {
      const calls = await gongClient.listCalls({ 
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
      });
      console.log(`✅ Retrieved ${calls.length} calls from Gong`);
    }
    
    console.log('🎉 End-to-End Test Completed Successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testE2E();
```

Run the E2E test:
```bash
node test-e2e.js
```

## 📊 API Usage & Monitoring

### Platform Rate Limits

| Platform  | Free Tier | Rate Limit | Notes |
|-----------|-----------|------------|-------|
| Gong      | N/A       | 3 req/s    | OAuth2 required |
| Clari     | N/A       | 10 req/s   | Bearer token |
| Fireflies | 50 req/day| Burst: 50  | GraphQL API |

### Health Check Endpoints

```bash
# Check platform connectivity
GET /health/gong
GET /health/clari  
GET /health/fireflies

# Check database status
GET /health/database

# Check SQS queue status
GET /health/queues
```

## 🔧 Configuration Options

### Custom Account Association Rules

```javascript
// Add custom domain rule
const rule = {
  id: 'custom-rule-1',
  name: 'Acme Corp Rule',
  type: 'domain',
  pattern: 'acme.com',
  accountId: 'account-123',
  priority: 100,
  active: true
};

associationService.addCustomRule(rule);
```

### Platform-Specific Settings

```javascript
// Gong client configuration
const gongClient = new GongClient({
  rateLimit: 3, // requests per second
  retryAttempts: 3,
  timeout: 30000
});

// Clari client configuration  
const clariClient = new ClariClient({
  rateLimit: 10,
  retryAttempts: 5,
  batchSize: 50
});
```

## 🐛 Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```bash
   # Check API credentials
   echo $GONG_CLIENT_ID
   echo $CLARI_API_TOKEN
   echo $FIREFLIES_API_KEY
   ```

2. **Database Connection Issues**
   ```bash
   # Test Supabase connection
   curl -H "apikey: $SUPABASE_SERVICE_KEY" \
        "$SUPABASE_URL/rest/v1/transcripts?select=count"
   ```

3. **Webhook Signature Verification**
   ```bash
   # Test webhook signature
   node -e "
   const crypto = require('crypto');
   const payload = JSON.stringify({test: true});
   const signature = crypto.createHmac('sha256', 'your-secret').update(payload).digest('hex');
   console.log('Expected signature:', 'sha256=' + signature);
   "
   ```

### Debug Mode

Enable debug logging:
```bash
export DEBUG=fireflies:*
export LOG_LEVEL=debug
npm run dev
```

## 📈 Production Deployment

### AWS Lambda Deployment

```bash
# Build the project
npm run build

# Deploy via CDK
cd infrastructure
cdk deploy --all

# Or use Serverless Framework
npm install -g serverless
serverless deploy
```

### Environment Variables Checklist

- [ ] All platform API keys configured
- [ ] Supabase URL and service key set
- [ ] Webhook secrets configured
- [ ] AWS region and SQS queue URLs
- [ ] Rate limiting parameters tuned

### Monitoring & Alerts

Set up CloudWatch alarms for:
- Lambda function errors
- SQS queue depth
- Database connection failures
- API rate limit violations

## 📄 License

Proprietary - All rights reserved.

---

**Need help?** Check the [troubleshooting guide](#-troubleshooting) for common issues and solutions.