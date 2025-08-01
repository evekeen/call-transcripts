# API Access Model Research Findings

## Summary
Research reveals that **2 out of 3 MVP platforms support organization-wide admin API access**, while Fireflies requires Enterprise plan for this capability.

## Platform-Specific Findings

### 1. Gong
**Access Model**: Admin-generated API key with organization scope
- ✅ Admin must generate API key (access key + secret)
- ✅ Can access all organization transcripts
- ⚠️ Rate limit: 3 requests/second
- 📝 Authentication: Bearer token in header

**Implementation**: Closest to ideal - single admin key can access all transcripts

### 2. Clari Copilot  
**Access Model**: Organization-wide API password (admin-controlled)
- ✅ Single organization-wide API password
- ✅ Admin generates password in Settings > Integrations > API Access
- ✅ API password shared across organization
- ✅ Access to all conversations/transcripts in organization
- ⚠️ Rate limit: 10 records/second, 100k/week
- 📝 Authentication: Basic Auth with `[email]:[API password]` Base64 encoded
- 📝 Business/Enterprise plans only

**Implementation**: Good - organization-wide access with single admin-controlled password

### 3. Fireflies
**Access Model**: Complex multi-tier system
- ❌ Standard API keys are user-specific (individual transcripts only)
- ⚠️ "Super Admin" role required for organization-wide access
- 🚨 **Enterprise Plan Only** for Super Admin access
- 🚨 Requires signed legal agreement for Super Admin role
- 📝 GraphQL API with bearer token authentication

**Major Challenge**: Organization-wide access requires Enterprise plan + legal agreement

## Impact on Architecture

### Original Vision (Not Feasible)
```
Admin drops in one API key → Access all organization transcripts
```

### Reality - Platform-Specific Approach
```
Gong: ✅ Admin API key → Access all organization transcripts
Clari: ✅ Organization API password → Access all conversations
Fireflies: ⚠️ Individual keys (or Enterprise Super Admin)
```

## Recommended Approach for MVP

### Primary Strategy: Admin/Organization Keys Where Possible
1. **Gong**: Admin generates organization-wide API key
2. **Clari**: Admin provides organization API password  
3. **Fireflies**: Hybrid approach based on customer's plan

### Implementation by Platform:

**Gong & Clari (Organization-wide access)**:
- Admin drops in single key/password
- System accesses all organization transcripts
- Clean implementation matching Steve's vision

**Fireflies (Conditional)**:
- If Enterprise: Request Super Admin setup
- If not Enterprise: Individual user keys with aggregation
- Provide upgrade path documentation

### Technical Implementation:
```yaml
Organization:
  - gong_api_key (admin)
  - clari_api_password (admin)
  - fireflies_approach: "enterprise" | "individual"
  
User (only for Fireflies non-enterprise):
  - fireflies_api_key
```

## Key Insights

1. **Fireflies Enterprise Requirement**: The "admin drops in key" approach Steve described may assume WinRate has Enterprise Fireflies plan

2. **Individual Keys Not a Blocker**: The aggregation approach still achieves the goal - all team members see all transcripts

3. **Security Consideration**: Individual keys actually provide better audit trail and granular revocation

## Recommendation

Proceed with individual key aggregation for MVP. This:
- Delivers the core value (team-wide transcript visibility)
- Works with customers' existing plans
- Can be enhanced later with admin keys where available
- Maintains the simple "paste your key" UX Steve wants