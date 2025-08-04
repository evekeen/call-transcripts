# Product Requirements Document: Multi-Platform Call Transcript Intelligence Tool

## Introduction/Overview

A sales intelligence tool that integrates with multiple call recording platforms (Gong, Clary, Fathom, Fireflies, Otter) to automatically organize call transcripts by client accounts and maintain searchable knowledge bases for sales preparation. The system provides organization-wide access to full transcripts, enabling sales teams to query historical call data using LLM capabilities, improving meeting preparation and decision-making.

**Problem**: Sales teams struggle to recall and utilize insights from previous client calls when preparing for meetings or making strategic decisions. Current solutions only provide summaries instead of full transcripts and limit access to individual users rather than the entire team working on an account.

**Goal**: Provide automated full transcript organization across multiple platforms with team-wide access and intelligent querying capabilities to enhance sales effectiveness.

## Goals

1. **Zero-loss data capture**: Ensure 100% of FULL call transcripts (not summaries) are captured and organized without hitting API rate limits
2. **Multi-platform support**: Integrate with Gong (priority 1), Clary (priority 2), Fathom, Fireflies, and Otter using admin API keys
3. **Account-centric access**: All team members can access all transcripts for their accounts, not just their individual calls
4. **Automated client grouping**: Group transcripts by client accounts using configurable rules (domain-based by default)
5. **Real-time updates**: Maintain up-to-date knowledge bases as new calls occur
6. **Efficient querying**: Enable LLM-powered queries on client-specific transcript collections
7. **Scalable architecture**: Support organization-wide access for all team members

## User Stories

### Sales Representative
- As a sales rep, I want all my call transcripts automatically organized by client so I don't have to manually categorize them
- As a sales rep, I want to query "What pain points did Acme Corp mention in our last 3 calls?" before a follow-up meeting
- As a sales rep, I want the system to capture every call transcript without me having to remember to sync
- As a sales rep, I want to see token costs for my queries so I can use the system efficiently

### Sales Manager
- As a sales manager, I want to see all transcripts from my team's meetings with a client, even if I've never personally met with them, so I can prepare effectively for important closing calls
- As a sales manager, I want to see transcript organization across my team's client accounts
- As a sales manager, I want to query team-wide insights like "What objections are we hearing most from enterprise clients?"
- As a sales manager, I want to customize how clients are grouped (by domain, manual tags, etc.)

## Functional Requirements

1. **Multi-Platform Integration**
   - FR1: System must authenticate with multiple platforms using admin API keys
   - FR2: System must support integrations in priority order: Gong, Clary, Fathom, Fireflies, Otter
   - FR3: System must retrieve FULL transcripts, not summaries
   - FR4: System must normalize data across different platform APIs
   - FR5: System must support both webhook and polling-based transcript updates where available
   - FR6: System must respect each platform's API rate limits
   - FR7: System must provide simple settings UI for dropping in admin API keys

2. **Account-Centric Organization**
   - FR8: System must tie transcripts to customer accounts, not individual users
   - FR9: System must provide organization-wide access to all transcripts for an account
   - FR10: System must group transcripts by attendee email domains by default
   - FR11: System must allow custom grouping rules (manual tags, meeting title patterns)
   - FR12: System must handle transcripts with multiple client domains (2-3 sellers meeting with 4-6 buyers)
   - FR13: System must provide interface to manually reassign transcript groupings

3. **Knowledge Base Management**
   - FR14: System must store FULL transcript content per client account (not summaries)
   - FR15: System must update client knowledge bases when new transcripts arrive
   - FR16: System must handle deleted or edited transcripts from all platforms
   - FR17: System must maintain transcript metadata (date, attendees, meeting type, platform source)

4. **Query Interface**
   - FR18: System must provide Lambda endpoint accepting natural language questions
   - FR19: System must route queries to appropriate client knowledge base in Supabase
   - FR20: System must return relevant transcript excerpts with metadata
   - FR21: System must support Bedrock (Claude) and OpenAI (GPT-4) for queries
   - FR22: System must include all team members' transcripts in query results
   - FR23: System must track token usage via Paid.ai for cost management

5. **Data Persistence**
   - FR24: System must persist full transcript data in Supabase with searchable format
   - FR25: System must maintain audit trail in CloudWatch logs
   - FR26: System must handle Lambda cold starts and restarts gracefully
   - FR27: System must track platform source and token usage per transcript

6. **Cost Management**
   - FR28: System must track LLM token usage via Paid.ai integration
   - FR29: System must provide cost visibility per account/query
   - FR30: System must implement token usage limits and alerts

## Non-Goals (Out of Scope)

- CRM system integrations (Salesforce, HubSpot)
- Advanced analytics dashboard (initial version focuses on querying)
- Real-time call transcription (relies on platform APIs)
- Multi-tenant architecture (single organization focus initially)
- Audio file storage or processing
- Meeting scheduling or calendar integration
- White-label recorder transcript processing (future phase)

## Technical Considerations

**API Constraints**:
- Each platform has different API structures and rate limits
- Admin API keys required for organization-wide access
- Platform-specific constraints:
  - Gong: REST API, 3 req/s limit, admin key access
  - Clari: REST API, 10 req/s limit, org password access
  - Fireflies: GraphQL, 50 req/day (free), Enterprise for admin access
- Need abstraction layer to normalize across platforms

**Technology Stack (Based on WinRate's Existing Infrastructure)**:
- **Frontend**: React + TypeScript with Tailwind/ShadCN, Zustand for state
- **Backend**: Express on AWS Lambda (serverless)
- **Database**: Supabase (Postgres) for transcript storage and metadata
- **Infrastructure**: AWS CDK, Amplify, CloudWatch for monitoring
- **Queue/Processing**: SQS → Lambda orchestration for transcript ingestion
- **LLM Integration**: Bedrock (Claude) + OpenAI (GPT-4) for querying
- **CI/CD**: GitHub Actions
- **Cost Tracking**: Paid.ai integration for token usage monitoring

**Architecture Implementation**:
- Multi-platform adapter pattern using TypeScript interfaces
- SQS queues for each platform to handle rate limits
- Lambda functions for webhook endpoints
- Supabase for transcript storage with vector embeddings
- Account association logic in dedicated Lambda
- React admin UI for API credential management
- Zustand store for real-time transcript updates

**Rate Limiting Strategy**:
- SQS with visibility timeout for exponential backoff
- Lambda concurrency controls per platform
- CloudWatch metrics for rate limit monitoring
- Supabase caching layer for frequently accessed transcripts

## Success Metrics

1. **Data Completeness**: 100% of available FULL transcripts captured across all platforms
2. **API Efficiency**: Stay within daily rate limits while maintaining real-time updates
3. **Query Relevance**: Users find transcript excerpts relevant to their queries >90% of the time
4. **System Reliability**: <1% transcript processing failures (monitored via CloudWatch)
5. **Response Time**: Query responses returned within 10 seconds
6. **Cost Efficiency**: LLM token usage tracked via Paid.ai stays within budget
7. **Processing Speed**: SQS → Lambda pipeline processes transcripts within 5 minutes

## Open Questions

1. **Supabase Configuration**: Optimal table structure for transcript storage and vector embeddings?
2. **Lambda Sizing**: Memory/timeout configurations for transcript processing functions?
3. **SQS Dead Letter Queues**: Retry strategy for failed transcript ingestions?
4. **Bedrock vs OpenAI**: Which LLM performs better for transcript querying?
5. **Paid.ai Thresholds**: Token usage limits and cost alerts configuration?
6. **CloudWatch Dashboards**: Key metrics to monitor for each integration?
7. **Account Association**: Enhance domain matching with ML model or rules engine?
8. **Data Retention**: Supabase storage policies and archival strategy?
9. **White-label Recorder**: Integration approach for WinRate's own call recorder?