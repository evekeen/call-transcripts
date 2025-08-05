import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Transcript, CallMetadata } from '../../integrations/base/platformAdapter';

export interface TranscriptRecord {
  id: string;
  account_id: string;
  platform: string;
  title: string;
  start_time: string;
  end_time: string;
  duration: number;
  full_text: string;
  recording_url?: string;
  ai_content?: any;
  processed_at: string;
  source: string;
  raw_metadata: any;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  transcript_id: string;
  sequence_number: number;
  speaker: string;
  speaker_email?: string;
  text: string;
  start_time: number;
  end_time: number;
  confidence?: number;
  created_at: string;
}

export interface AccountRecord {
  id: string;
  name: string;
  domain: string;
  created_at: string;
  updated_at: string;
  metadata: any;
}

export interface SearchOptions {
  accountIds?: string[];
  platforms?: string[];
  startDate?: Date;
  endDate?: Date;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  transcripts: TranscriptRecord[];
  segments: TranscriptSegmentRecord[];
  totalCount: number;
}

export class TranscriptRepository {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase URL or service key');
    }

    this.supabase = createClient(url, key);
  }

  async createTranscript(
    transcript: Transcript,
    accountId: string,
    aiContent?: any,
    source: string = 'webhook'
  ): Promise<TranscriptRecord> {
    const { data, error } = await this.supabase
      .from('transcripts')
      .insert({
        id: transcript.callId,
        account_id: accountId,
        platform: transcript.metadata.platform,
        title: transcript.metadata.title,
        start_time: transcript.metadata.startTime.toISOString(),
        end_time: transcript.metadata.endTime.toISOString(),
        duration: transcript.metadata.duration,
        full_text: transcript.fullText,
        recording_url: transcript.metadata.recordingUrl,
        ai_content: aiContent || {},
        source,
        raw_metadata: {
          attendees: transcript.metadata.attendees,
          originalData: transcript.metadata
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create transcript: ${error.message}`);
    }

    // Store segments
    if (transcript.segments.length > 0) {
      await this.createTranscriptSegments(transcript.callId, transcript.segments);
    }

    return data;
  }

  async updateTranscript(
    transcriptId: string,
    updates: Partial<TranscriptRecord>
  ): Promise<TranscriptRecord> {
    const { data, error } = await this.supabase
      .from('transcripts')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', transcriptId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update transcript: ${error.message}`);
    }

    return data;
  }

  async getTranscriptById(transcriptId: string): Promise<TranscriptRecord | null> {
    const { data, error } = await this.supabase
      .from('transcripts')
      .select('*')
      .eq('id', transcriptId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get transcript: ${error.message}`);
    }

    return data;
  }

  async getTranscriptSegments(transcriptId: string): Promise<TranscriptSegmentRecord[]> {
    const { data, error } = await this.supabase
      .from('transcript_segments')
      .select('*')
      .eq('transcript_id', transcriptId)
      .order('sequence_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to get transcript segments: ${error.message}`);
    }

    return data || [];
  }

  async createTranscriptSegments(
    transcriptId: string,
    segments: any[]
  ): Promise<TranscriptSegmentRecord[]> {
    // Delete existing segments first
    await this.supabase
      .from('transcript_segments')
      .delete()
      .eq('transcript_id', transcriptId);

    const segmentRecords = segments.map((segment, index) => ({
      transcript_id: transcriptId,
      sequence_number: index,
      speaker: segment.speaker,
      speaker_email: segment.speakerEmail,
      text: segment.text,
      start_time: segment.startTime,
      end_time: segment.endTime,
      confidence: segment.confidence
    }));

    // Insert in batches
    const batchSize = 100;
    const results: TranscriptSegmentRecord[] = [];

    for (let i = 0; i < segmentRecords.length; i += batchSize) {
      const batch = segmentRecords.slice(i, i + batchSize);
      const { data, error } = await this.supabase
        .from('transcript_segments')
        .insert(batch)
        .select();

      if (error) {
        throw new Error(`Failed to create transcript segments: ${error.message}`);
      }

      results.push(...(data || []));
    }

    return results;
  }

  async searchTranscripts(options: SearchOptions): Promise<SearchResult> {
    let query = this.supabase
      .from('transcripts')
      .select('*', { count: 'exact' });

    // Apply filters
    if (options.accountIds && options.accountIds.length > 0) {
      query = query.in('account_id', options.accountIds);
    }

    if (options.platforms && options.platforms.length > 0) {
      query = query.in('platform', options.platforms);
    }

    if (options.startDate) {
      query = query.gte('start_time', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('start_time', options.endDate.toISOString());
    }

    if (options.query) {
      // Use full-text search
      query = query.textSearch('full_text', options.query);
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    // Order by start time descending
    query = query.order('start_time', { ascending: false });

    const { data: transcripts, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search transcripts: ${error.message}`);
    }

    // Get segments for relevant transcripts if we have a text query
    let segments: TranscriptSegmentRecord[] = [];
    if (options.query && transcripts && transcripts.length > 0) {
      const transcriptIds = transcripts.map(t => t.id);
      const { data: segmentData, error: segmentError } = await this.supabase
        .from('transcript_segments')
        .select('*')
        .in('transcript_id', transcriptIds)
        .textSearch('text', options.query)
        .order('transcript_id')
        .order('sequence_number');

      if (segmentError) {
        console.warn('Failed to search segments:', segmentError);
      } else {
        segments = segmentData || [];
      }
    }

    return {
      transcripts: transcripts || [],
      segments,
      totalCount: count || 0
    };
  }

  async getAccountByDomain(domain: string): Promise<AccountRecord | null> {
    const { data, error } = await this.supabase
      .from('accounts')
      .select('*')
      .eq('domain', domain)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get account: ${error.message}`);
    }

    return data;
  }

  async createAccount(name: string, domain: string, metadata?: any): Promise<AccountRecord> {
    const { data, error } = await this.supabase
      .from('accounts')
      .insert({
        name,
        domain,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create account: ${error.message}`);
    }

    return data;
  }

  async getTranscriptsByAccount(
    accountId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TranscriptRecord[]> {
    const { data, error } = await this.supabase
      .from('transcripts')
      .select('*')
      .eq('account_id', accountId)
      .order('start_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get transcripts by account: ${error.message}`);
    }

    return data || [];
  }

  async deleteTranscript(transcriptId: string): Promise<void> {
    // Segments will be deleted automatically due to CASCADE
    const { error } = await this.supabase
      .from('transcripts')
      .delete()
      .eq('id', transcriptId);

    if (error) {
      throw new Error(`Failed to delete transcript: ${error.message}`);
    }
  }

  async getProcessingStats(): Promise<{
    totalTranscripts: number;
    transcriptsByPlatform: Record<string, number>;
    transcriptsLastWeek: number;
    averageProcessingTime: number;
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get total count
    const { count: totalTranscripts } = await this.supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true });

    // Get counts by platform
    const { data: platformData } = await this.supabase
      .from('transcripts')
      .select('platform')
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        data?.forEach(item => {
          counts[item.platform] = (counts[item.platform] || 0) + 1;
        });
        return { data: counts };
      });

    // Get transcripts from last week
    const { count: transcriptsLastWeek } = await this.supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo.toISOString());

    return {
      totalTranscripts: totalTranscripts || 0,
      transcriptsByPlatform: platformData || {},
      transcriptsLastWeek: transcriptsLastWeek || 0,
      averageProcessingTime: 0 // Would need additional logging to calculate
    };
  }
}