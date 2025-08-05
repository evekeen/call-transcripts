import { TranscriptRepository } from '../database/repositories/transcriptRepository';
import { Transcript, Attendee } from '../integrations/base/platformAdapter';

export interface AccountAssociationRule {
  id: string;
  name: string;
  type: 'domain' | 'email_pattern' | 'title_pattern' | 'manual';
  pattern?: string;
  accountId?: string;
  priority: number;
  active: boolean;
}

export interface AccountAssociationResult {
  accountId: string;
  confidence: number;
  rule: string;
  suggestions?: string[];
}

export class AccountAssociationService {
  private repository: TranscriptRepository;
  private internalDomains: Set<string>;
  private customRules: AccountAssociationRule[];

  constructor(repository: TranscriptRepository) {
    this.repository = repository;
    this.internalDomains = new Set([
      'gmail.com',
      'yahoo.com', 
      'hotmail.com',
      'outlook.com',
      'icloud.com',
      'me.com',
      'aol.com',
      'protonmail.com',
      'tutanota.com'
    ]);
    this.customRules = [];
  }

  async determineAccountAssociation(transcript: Transcript): Promise<AccountAssociationResult> {
    // First check for custom rules
    const customResult = await this.applyCustomRules(transcript);
    if (customResult) {
      return customResult;
    }

    // Apply domain-based association
    const domainResult = await this.applyDomainBasedAssociation(transcript);
    if (domainResult) {
      return domainResult;
    }

    // Fallback to creating unknown account
    const fallbackAccount = await this.createFallbackAccount(transcript);
    return {
      accountId: fallbackAccount.id,
      confidence: 0.3,
      rule: 'fallback',
      suggestions: await this.generateSuggestions(transcript)
    };
  }

  private async applyCustomRules(transcript: Transcript): Promise<AccountAssociationResult | null> {
    const activeRules = this.customRules
      .filter(rule => rule.active)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      const result = await this.evaluateRule(rule, transcript);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private async evaluateRule(
    rule: AccountAssociationRule, 
    transcript: Transcript
  ): Promise<AccountAssociationResult | null> {
    switch (rule.type) {
      case 'domain':
        return this.evaluateDomainRule(rule, transcript);
      case 'email_pattern':
        return this.evaluateEmailPatternRule(rule, transcript);
      case 'title_pattern':
        return this.evaluateTitlePatternRule(rule, transcript);
      case 'manual':
        return rule.accountId ? {
          accountId: rule.accountId,
          confidence: 1.0,
          rule: rule.name
        } : null;
      default:
        return null;
    }
  }

  private async evaluateDomainRule(
    rule: AccountAssociationRule,
    transcript: Transcript
  ): Promise<AccountAssociationResult | null> {
    if (!rule.pattern || !rule.accountId) return null;

    const domains = this.extractExternalDomains(transcript.metadata.attendees);
    const matchingDomain = domains.find(domain => 
      domain.toLowerCase() === rule.pattern!.toLowerCase()
    );

    if (matchingDomain) {
      return {
        accountId: rule.accountId,
        confidence: 0.9,
        rule: rule.name
      };
    }

    return null;
  }

  private async evaluateEmailPatternRule(
    rule: AccountAssociationRule,
    transcript: Transcript
  ): Promise<AccountAssociationResult | null> {
    if (!rule.pattern || !rule.accountId) return null;

    const regex = new RegExp(rule.pattern, 'i');
    const matchingEmail = transcript.metadata.attendees.find(attendee =>
      regex.test(attendee.email)
    );

    if (matchingEmail) {
      return {
        accountId: rule.accountId,
        confidence: 0.8,
        rule: rule.name
      };
    }

    return null;
  }

  private async evaluateTitlePatternRule(
    rule: AccountAssociationRule,
    transcript: Transcript
  ): Promise<AccountAssociationResult | null> {
    if (!rule.pattern || !rule.accountId) return null;

    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(transcript.metadata.title)) {
      return {
        accountId: rule.accountId,
        confidence: 0.7,
        rule: rule.name
      };
    }

    return null;
  }

  private async applyDomainBasedAssociation(
    transcript: Transcript
  ): Promise<AccountAssociationResult | null> {
    const domains = this.extractExternalDomains(transcript.metadata.attendees);
    
    if (domains.length === 0) {
      return null;
    }

    // Count domain frequency
    const domainCounts = domains.reduce((acc, domain) => {
      acc[domain] = (acc[domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get the most frequent domain
    const [primaryDomain, count] = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)[0];

    // Calculate confidence based on domain dominance
    const totalExternalAttendees = domains.length;
    const confidence = Math.min(0.9, count / totalExternalAttendees + 0.3);

    // Check if account already exists
    let account = await this.repository.getAccountByDomain(primaryDomain);
    
    if (!account) {
      // Create new account
      const accountName = this.generateAccountName(primaryDomain, transcript);
      account = await this.repository.createAccount(accountName, primaryDomain, {
        source: 'auto-created',
        firstTranscriptId: transcript.callId,
        createdFromDomain: primaryDomain
      });
    }

    return {
      accountId: account.id,
      confidence,
      rule: 'domain-based',
      suggestions: domains.filter(d => d !== primaryDomain)
    };
  }

  private extractExternalDomains(attendees: Attendee[]): string[] {
    return attendees
      .map(attendee => attendee.email.split('@')[1])
      .filter(domain => domain && !this.internalDomains.has(domain.toLowerCase()))
      .filter(Boolean);
  }

  private generateAccountName(domain: string, transcript: Transcript): string {
    // Try to extract company name from attendee info
    const externalAttendee = transcript.metadata.attendees.find(attendee => 
      attendee.email.endsWith(`@${domain}`) && attendee.company
    );

    if (externalAttendee?.company) {
      return externalAttendee.company;
    }

    // Fallback to domain-based name
    const parts = domain.split('.');
    const mainPart = parts[0];
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }

  private async createFallbackAccount(transcript: Transcript): Promise<{ id: string }> {
    const fallbackName = `Unknown (${transcript.callId})`;
    const fallbackDomain = `unknown-${transcript.callId}`;
    
    const account = await this.repository.createAccount(fallbackName, fallbackDomain, {
      source: 'fallback',
      transcriptId: transcript.callId,
      needsReview: true
    });

    return account;
  }

  private async generateSuggestions(transcript: Transcript): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Extract company names from attendee info
    const companies = transcript.metadata.attendees
      .map(attendee => attendee.company)
      .filter(Boolean);

    suggestions.push(...companies);

    // Extract potential company names from title
    const titleWords = transcript.metadata.title
      .split(/\s+/)
      .filter(word => word.length > 2 && /^[A-Z]/.test(word));

    suggestions.push(...titleWords);

    // Remove duplicates and return top 5
    return [...new Set(suggestions)].slice(0, 5);
  }

  addCustomRule(rule: AccountAssociationRule): void {
    this.customRules.push(rule);
    this.customRules.sort((a, b) => b.priority - a.priority);
  }

  removeCustomRule(ruleId: string): void {
    this.customRules = this.customRules.filter(rule => rule.id !== ruleId);
  }

  getCustomRules(): AccountAssociationRule[] {
    return [...this.customRules];
  }

  async reassociateTranscript(
    transcriptId: string,
    newAccountId: string,
    reason: string,
    userId?: string
  ): Promise<void> {
    // Get current transcript
    const transcript = await this.repository.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    const oldAccountId = transcript.account_id;

    // Update transcript
    await this.repository.updateTranscript(transcriptId, {
      account_id: newAccountId
    });

    // Log the association change (would implement audit log here)
    console.log(`Transcript ${transcriptId} reassociated from ${oldAccountId} to ${newAccountId}. Reason: ${reason}`);
  }

  async getAccountSuggestions(transcriptId: string): Promise<{
    currentAccountId: string;
    suggestions: Array<{
      accountId: string;
      accountName: string;
      confidence: number;
      reason: string;
    }>;
  }> {
    const transcript = await this.repository.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    // This would implement ML-based suggestions in a real system
    // For now, return domain-based suggestions
    const suggestions = [];
    
    return {
      currentAccountId: transcript.account_id,
      suggestions
    };
  }
}