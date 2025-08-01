# Access Control Design for Team-Wide Transcript Visibility

## Core Requirement from Steve's Call

"When you're working a deal, you have 2-3 people from your company meeting with 4-6 people from their company. If you're a sales manager viewing meeting prep for the day and asked to join a big closing call, you might not see any call transcripts because you've never met with them before, but your sales team has been meeting with them repeatedly."

## Proposed Solution: Account-Based Access (Not User-Based)

### Option 1: Simplified Account-Based Model (Recommended for MVP)
**Core Principle**: All transcripts are tied to customer accounts, and any authenticated user in your organization can access any account's transcripts.

**Implementation**:
- Single organization-wide admin API key for each platform
- All transcripts flow into shared account knowledge bases
- No individual access restrictions within the organization
- Trust-based model (appropriate for most sales teams)

**Benefits**:
- Simple to implement
- Matches Steve's vision perfectly
- No complex permission management
- Sales managers always have full visibility

**When this works**:
- Small to medium sales teams (up to ~50 people)
- High-trust environments
- Teams that already share CRM data openly

### Option 2: Role-Based Access Control (Future Enhancement)
**If needed later**, add lightweight roles:

1. **Admin** - Manage API keys, view all transcripts
2. **Manager** - View all transcripts for their team's accounts
3. **Rep** - View all transcripts (default behavior)

**Key Design Decision**: Even reps can see all account transcripts by default, not just their own calls. This ensures collaboration and prevents the "blind spots" Steve mentioned.

### Option 3: Territory-Based Access (Phase 2)
For larger organizations:
- Tie accounts to territories/segments
- Users see transcripts for accounts in their territory
- Managers see all territories they oversee
- Override capability for deal collaboration

## Technical Implementation for MVP

```yaml
Data Model:
  Account:
    - id
    - domain
    - name
    
  Transcript:
    - id
    - account_id (foreign key)
    - platform_source (gong/clari/fireflies)
    - meeting_date
    - attendees[]
    - content
    
  User:
    - id
    - email
    - organization_id
```

**Access Logic (MVP)**:
```
if user.organization_id == account.organization_id:
    grant_access(all_transcripts_for_account)
```

No complex ACL needed - organization membership = full access.

## Configuration Approach

### For MVP:
1. Single "organization" concept
2. All users who authenticate belong to that organization
3. All transcripts visible to all authenticated users
4. Focus on account grouping logic instead of access control

### Why This Works:
- Sales teams already share deal information in CRM
- Transcript access follows same pattern as deal access
- Removes friction from Steve's scenario
- Managers can jump into any deal with full context

## Future Considerations

**When to add access control**:
- Multiple business units with separated sales teams
- Compliance requirements for data segregation  
- Enterprise deployment with 100+ users
- Explicit customer request

**What to avoid**:
- Over-engineering permissions for MVP
- Creating the same "individual silo" problem Steve described
- Adding friction to the sales manager use case

## Recommendation

Start with Option 1 (Simplified Account-Based Model):
- All transcripts tied to accounts
- All team members see all account transcripts
- No complex permissions
- Solves Steve's core problem immediately

This matches Steve's vision: "transcripts tied to the account and any user at the account" can access them. The emphasis is on breaking down silos, not creating new access barriers.