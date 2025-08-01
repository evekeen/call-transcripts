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
   - FR18: System must provide query endpoint that accepts natural language questions
   - FR19: System must route queries to appropriate client knowledge base
   - FR20: System must return relevant transcript excerpts with metadata
   - FR21: System must support both RAG and direct LLM memory approaches
   - FR22: System must include all team members' transcripts in query results

5. **Data Persistence**
   - FR23: System must persist full transcript data in searchable format
   - FR24: System must maintain audit trail of transcript processing
   - FR25: System must handle system restarts without data loss
   - FR26: System must track which platform each transcript originated from

## Non-Goals (Out of Scope)

- CRM system integrations (Salesforce, HubSpot)
- Advanced analytics dashboard (initial version focuses on querying)
- Real-time call transcription (relies on Fireflies for transcription)
- Multi-tenant architecture (single organization focus initially)
- Audio file storage or processing
- Meeting scheduling or calendar integration

## Technical Considerations

**API Constraints**:
- Each platform has different API structures and rate limits
- Admin API keys required for organization-wide access
- Platform-specific constraints:
  - Gong: Enterprise-focused, robust API
  - Clary: Enterprise customer actively using
  - Fireflies: GraphQL endpoint, 50 requests/day on free plan
  - Fathom & Otter: Research API capabilities
- Need abstraction layer to normalize across platforms

**Technology Stack Options**:
- **TypeScript**: Better for API integrations, strong typing, Node.js ecosystem
- **Python**: Better for LLM integrations, RAG pipelines, data processing

**Architecture Suggestions**:
- Multi-platform adapter pattern for different APIs
- Account-centric data model (not user-centric)
- Background job queue for transcript processing
- Vector database for semantic search capabilities (if using RAG)
- Caching layer to minimize API calls
- Configuration system for grouping rules
- Simple admin UI for API key management

**Rate Limiting Strategy**:
- Implement exponential backoff
- Cache frequently accessed data
- Use webhooks when possible to reduce polling
- Batch API requests efficiently

## Success Metrics

1. **Data Completeness**: 100% of available FULL transcripts captured across all platforms
2. **API Efficiency**: Stay within daily rate limits while maintaining real-time updates
3. **Query Relevance**: Users find transcript excerpts relevant to their queries >90% of the time
4. **System Reliability**: <1% transcript processing failures
5. **Response Time**: Query responses returned within 10 seconds

## Open Questions

1. **Platform API Requirements**: What are the exact rate limits and admin API capabilities for each platform?
2. **Integration Priority**: Confirm priority order: Gong → Clary → Fathom → Fireflies → Otter
3. **LLM Integration**: Should we use OpenAI, Claude, or local models for query processing?
4. **Deployment**: Cloud functions, containers, or dedicated servers?
5. **Storage**: Vector database (Pinecone, Weaviate) vs traditional database with embeddings?
6. **Authentication**: How should admin API keys be securely stored and managed?
7. **Account Association**: How to improve domain-based account matching beyond current "not perfect" approach?
8. **Data Retention**: How long should transcripts be stored? Any compliance requirements?
9. **Engineering Resources**: Coordination between India-based team and US-based dev leadership