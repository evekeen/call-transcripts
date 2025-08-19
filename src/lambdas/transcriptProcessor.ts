import { SQSEvent, SQSRecord } from 'aws-lambda';
import { PlatformFactory, PlatformType } from '../integrations/platformFactory';
import { PlatformAdapter, Transcript } from '../integrations/base/platformAdapter';
import { createClient } from '@supabase/supabase-js';

interface TranscriptMessage {
  platform: PlatformType;
  callId: string;
  eventType: string;
  timestamp: string;
  workspaceId?: string;
  callData?: any;
  source: 'webhook' | 'batch';
}

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log(`Processing ${event.Records.length} transcript messages`);

  const results = await Promise.allSettled(
    event.Records.map(record => processTranscriptRecord(record))
  );

  // Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`Transcript processing completed: ${successful} successful, ${failed} failed`);

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to process record ${index}:`, result.reason);
    }
  });
};

async function processTranscriptRecord(record: SQSRecord): Promise<void> {
  try {
    const message: TranscriptMessage = JSON.parse(record.body);
    console.log(`Processing transcript for ${message.platform} call: ${message.callId}`);

    // Get platform client
    const secretName = `${message.platform}-api-credentials`;
    const client: PlatformAdapter = PlatformFactory.createClient(
      message.platform,
      secretName,
      process.env.AWS_REGION
    );

    // Authenticate client
    await client.authenticate();

    // Retrieve transcript
    const transcript: Transcript = await client.getTranscript(message.callId);

    // Get AI content if available
    let aiContent = null;
    if (client.getAIContent) {
      try {
        aiContent = await client.getAIContent(message.callId);
      } catch (error) {
        console.warn(`Failed to retrieve AI content for ${message.callId}:`, error);
      }
    }

    // Determine account association
    const accountId = await determineAccountAssociation(transcript);

    // Store transcript in Supabase
    await storeTranscript(transcript, aiContent, accountId, message);

    console.log(`Successfully processed transcript for call: ${message.callId}`);

  } catch (error) {
    console.error(`Error processing transcript record:`, error);
    throw error; // Re-throw to trigger SQS retry logic
  }
}

async function determineAccountAssociation(transcript: Transcript): Promise<string> {
  // Extract domains from attendee emails
  const domains = transcript.metadata.attendees
    .map(attendee => attendee.email.split('@')[1])
    .filter(domain => domain && !isInternalDomain(domain));

  // Group by most common external domain
  const domainCounts = domains.reduce((acc, domain) => {
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get the most frequent external domain
  const primaryDomain = Object.entries(domainCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0];

  if (!primaryDomain) {
    // Fallback to call title or ID
    return `unknown-${transcript.callId}`;
  }

  // Check if account already exists
  const { data: existingAccount } = await getSupabaseClient()
    .from('accounts')
    .select('id')
    .eq('domain', primaryDomain)
    .single();

  if (existingAccount) {
    return existingAccount.id as string;
  }

  // Create new account
  const { data: newAccount, error } = await getSupabaseClient()
    .from('accounts')
    .insert({
      name: primaryDomain,
      domain: primaryDomain,
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create account:', error);
    return `domain-${primaryDomain}`;
  }

  return newAccount.id as string;
}

function isInternalDomain(domain: string): boolean {
  // Common internal/personal domains to exclude
  const internalDomains = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'me.com',
    'aol.com'
  ];

  return internalDomains.includes(domain.toLowerCase());
}

async function storeTranscript(
  transcript: Transcript,
  aiContent: any,
  accountId: string,
  message: TranscriptMessage
): Promise<void> {
  // Store main transcript record
  const { data: transcriptRecord, error: transcriptError } = await getSupabaseClient()
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
      ai_content: aiContent,
      processed_at: new Date().toISOString(),
      source: message.source,
      raw_metadata: {
        platform_data: message,
        attendees: transcript.metadata.attendees
      }
    })
    .select('id')
    .single();

  if (transcriptError) {
    if (transcriptError.code === '23505') { // Duplicate key
      console.log(`Transcript ${transcript.callId} already exists, updating...`);
      
      const { error: updateError } = await getSupabaseClient()
        .from('transcripts')
        .update({
          full_text: transcript.fullText,
          ai_content: aiContent,
          processed_at: new Date().toISOString(),
          raw_metadata: {
            platform_data: message,
            attendees: transcript.metadata.attendees
          }
        })
        .eq('id', transcript.callId);

      if (updateError) {
        throw new Error(`Failed to update transcript: ${updateError.message}`);
      }
    } else {
      throw new Error(`Failed to store transcript: ${transcriptError.message}`);
    }
  }

  // Store transcript segments
  if (transcript.segments.length > 0) {
    const segments = transcript.segments.map((segment, index) => ({
      transcript_id: transcript.callId,
      sequence_number: index,
      speaker: segment.speaker,
      speaker_email: segment.speakerEmail,
      text: segment.text,
      start_time: segment.startTime,
      end_time: segment.endTime,
      confidence: segment.confidence
    }));

    // Delete existing segments first (in case of update)
    await getSupabaseClient()
      .from('transcript_segments')
      .delete()
      .eq('transcript_id', transcript.callId);

    // Insert new segments in batches
    const batchSize = 100;
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const { error: segmentError } = await getSupabaseClient()
        .from('transcript_segments')
        .insert(batch);

      if (segmentError) {
        console.error(`Failed to store segment batch ${i}-${i + batch.length}:`, segmentError);
        throw new Error(`Failed to store transcript segments: ${segmentError.message}`);
      }
    }
  }

  console.log(`Stored transcript ${transcript.callId} with ${transcript.segments.length} segments`);
}