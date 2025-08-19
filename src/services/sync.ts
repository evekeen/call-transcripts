import { Database } from '../database';
import { FirefliesService } from './fireflies';
import { ClientGroupingService } from './client-grouping';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

export class SyncService {
  private db: Database;
  private firefliesService: FirefliesService;
  private groupingService: ClientGroupingService;

  constructor() {
    this.db = new Database();
    this.firefliesService = new FirefliesService();
    this.groupingService = new ClientGroupingService(this.db);
  }

  async syncAllTranscripts(): Promise<void> {
    console.log('Starting full transcript sync...');
    
    const apiUsageToday = await this.db.getApiUsageToday();
    
    if (apiUsageToday >= config.fireflies.maxRequestsPerDay) {
      console.log('API usage limit reached for today, skipping sync');
      return;
    }

    let skip = 0;
    const batchSize = 50;
    let hasMore = true;

    while (hasMore && apiUsageToday < config.fireflies.maxRequestsPerDay) {
      try {
        console.log(`Fetching transcripts batch: skip=${skip}, limit=${batchSize}`);
        
        const transcripts = await this.firefliesService.getTranscripts(batchSize, skip);
        await this.db.logApiUsage('getTranscripts', true);
        
        if (transcripts.length === 0) {
          hasMore = false;
          break;
        }

        for (const transcript of transcripts) {
          await this.processTranscript(transcript);
        }

        skip += batchSize;
        hasMore = transcripts.length === batchSize;

        // Rate limiting: wait between batches
        if (hasMore) {
          await this.sleep(1000); // 1 second delay
        }

      } catch (error) {
        console.error('Error in sync batch:', error);
        await this.db.logApiUsage('getTranscripts', false, (error as Error).message);
        break;
      }
    }

    console.log('Full transcript sync completed');
  }

  async syncRecentTranscripts(): Promise<void> {
    console.log('Starting recent transcript sync...');
    
    const apiUsageToday = await this.db.getApiUsageToday();
    
    if (apiUsageToday >= config.fireflies.maxRequestsPerDay) {
      console.log('API usage limit reached for today, skipping sync');
      return;
    }

    try {
      // Get transcripts from last 7 days
      const since = new Date();
      since.setDate(since.getDate() - 7);
      
      const recentTranscripts = await this.firefliesService.getRecentTranscripts(since);
      await this.db.logApiUsage('getRecentTranscripts', true);
      
      console.log(`Found ${recentTranscripts.length} recent transcripts`);

      for (const transcript of recentTranscripts) {
        await this.processTranscript(transcript);
      }

    } catch (error) {
      console.error('Error in recent sync:', error);
      await this.db.logApiUsage('getRecentTranscripts', false, (error as Error).message);
    }

    console.log('Recent transcript sync completed');
  }

  private async processTranscript(firefliesTranscript: any): Promise<void> {
    try {
      // Check if transcript already exists
      const existing = await this.db.getTranscriptByFirefliesId(firefliesTranscript.id);
      
      if (existing) {
        // Update existing transcript if content changed
        if (existing.transcript_text !== firefliesTranscript.transcript_text) {
          console.log(`Updating transcript: ${firefliesTranscript.title}`);
          await this.updateTranscript(existing.id, firefliesTranscript);
        }
        return;
      }

      // Assign to client account
      const clientAccountId = await this.groupingService.assignTranscriptToClient(firefliesTranscript);
      
      if (!clientAccountId) {
        console.warn(`Could not assign client for transcript: ${firefliesTranscript.title}`);
        return;
      }

      // Create new transcript record
      const transcriptRecord = {
        id: uuidv4(),
        fireflies_id: firefliesTranscript.id,
        client_account_id: clientAccountId,
        title: firefliesTranscript.title,
        transcript_text: firefliesTranscript.transcript_text,
        date: firefliesTranscript.date,
        duration: firefliesTranscript.duration,
        attendees: JSON.stringify(firefliesTranscript.meeting_attendees),
        summary: firefliesTranscript.summary,
      };

      await this.db.createTranscript(transcriptRecord);
      console.log(`Created transcript: ${firefliesTranscript.title}`);

    } catch (error) {
      console.error(`Error processing transcript ${firefliesTranscript.title}:`, error);
    }
  }

  private async updateTranscript(transcriptId: string, firefliesTranscript: any): Promise<void> {
    // Get existing record to preserve client assignment
    const existing = await this.db.getTranscriptByFirefliesId(firefliesTranscript.id);
    
    if (!existing) return;

    const updated = {
      ...existing,
      title: firefliesTranscript.title,
      transcript_text: firefliesTranscript.transcript_text,
      date: firefliesTranscript.date,
      duration: firefliesTranscript.duration,
      attendees: JSON.stringify(firefliesTranscript.meeting_attendees),
      summary: firefliesTranscript.summary,
    };

    await this.db.createTranscript(updated);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getStatus(): Promise<{
    totalTranscripts: number;
    apiUsageToday: number;
    maxRequestsPerDay: number;
    clientAccounts: number;
  }> {
    const clients = await this.db.getClientAccounts();
    const apiUsageToday = await this.db.getApiUsageToday();
    
    // This would require a count query - simplified for now
    const totalTranscripts = 0; // TODO: implement count query
    
    return {
      totalTranscripts,
      apiUsageToday,
      maxRequestsPerDay: config.fireflies.maxRequestsPerDay,
      clientAccounts: clients.length,
    };
  }
}