import { Database } from '../database';
import { FirefliesTranscript, ClientAccount, GroupingRule } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ClientGroupingService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async assignTranscriptToClient(transcript: FirefliesTranscript): Promise<string | null> {
    const groupingRules = await this.db.getGroupingRules();
    
    // Try each grouping rule
    for (const rule of groupingRules) {
      const clientId = await this.applyGroupingRule(transcript, rule);
      if (clientId) {
        return clientId;
      }
    }

    // Default domain-based grouping
    return await this.assignByDomain(transcript);
  }

  private async applyGroupingRule(transcript: FirefliesTranscript, rule: GroupingRule): Promise<string | null> {
    switch (rule.type) {
      case 'domain':
        return await this.assignByDomainRule(transcript, rule);
      case 'title_pattern':
        return await this.assignByTitlePattern(transcript, rule);
      case 'manual':
        // Manual assignments are handled separately
        return null;
      default:
        return null;
    }
  }

  private async assignByDomainRule(transcript: FirefliesTranscript, rule: GroupingRule): Promise<string | null> {
    const domains = this.extractDomainsFromTranscript(transcript);
    
    if (domains.includes(rule.value)) {
      return rule.client_account_id;
    }
    
    return null;
  }

  private async assignByTitlePattern(transcript: FirefliesTranscript, rule: GroupingRule): Promise<string | null> {
    const pattern = new RegExp(rule.value, 'i');
    
    if (pattern.test(transcript.title)) {
      return rule.client_account_id;
    }
    
    return null;
  }

  private async assignByDomain(transcript: FirefliesTranscript): Promise<string | null> {
    const domains = this.extractDomainsFromTranscript(transcript);
    
    if (domains.length === 0) {
      return await this.getOrCreateUnknownClient();
    }

    // Use the most common external domain (excluding common email providers)
    const externalDomains = domains.filter(domain => 
      !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(domain.toLowerCase())
    );

    const primaryDomain = externalDomains[0] || domains[0];
    const clientName = this.domainToClientName(primaryDomain);

    return await this.getOrCreateClientByDomain(primaryDomain, clientName);
  }

  private extractDomainsFromTranscript(transcript: FirefliesTranscript): string[] {
    const domains = new Set<string>();
    
    transcript.meeting_attendees.forEach(attendee => {
      if (attendee.email) {
        const domain = attendee.email.split('@')[1]?.toLowerCase();
        if (domain) {
          domains.add(domain);
        }
      }
    });

    return Array.from(domains);
  }

  private domainToClientName(domain: string): string {
    // Convert domain to readable client name
    // e.g., "acmecorp.com" -> "Acme Corp"
    return domain
      .replace(/\.(com|org|net|io|co)$/, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async getOrCreateClientByDomain(domain: string, name: string): Promise<string> {
    const clients = await this.db.getClientAccounts();
    const existingClient = clients.find(c => c.domain === domain);
    
    if (existingClient) {
      return existingClient.id;
    }

    // Create new client
    const clientId = uuidv4();
    await this.db.createClientAccount({
      id: clientId,
      name,
      domain,
      grouping_rule: 'domain',
    });

    // Create domain grouping rule
    await this.db.createGroupingRule({
      type: 'domain',
      value: domain,
      client_account_id: clientId,
    });

    return clientId;
  }

  private async getOrCreateUnknownClient(): Promise<string> {
    const clients = await this.db.getClientAccounts();
    const unknownClient = clients.find(c => c.name === 'Unknown');
    
    if (unknownClient) {
      return unknownClient.id;
    }

    // Create unknown client
    const clientId = uuidv4();
    await this.db.createClientAccount({
      id: clientId,
      name: 'Unknown',
      domain: '',
      grouping_rule: 'manual',
    });

    return clientId;
  }

  async createManualGroupingRule(clientAccountId: string, transcriptId: string): Promise<void> {
    await this.db.createGroupingRule({
      type: 'manual',
      value: transcriptId,
      client_account_id: clientAccountId,
    });
  }

  async createTitlePatternRule(clientAccountId: string, pattern: string): Promise<void> {
    await this.db.createGroupingRule({
      type: 'title_pattern',
      value: pattern,
      client_account_id: clientAccountId,
    });
  }

  async createDomainRule(clientAccountId: string, domain: string): Promise<void> {
    await this.db.createGroupingRule({
      type: 'domain',
      value: domain,
      client_account_id: clientAccountId,
    });
  }
}