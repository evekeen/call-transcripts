import { ScheduledEvent, Context } from 'aws-lambda';
import { PlatformFactory, PlatformType } from '../integrations/platformFactory';
import { TranscriptRepository } from '../database/repositories/transcriptRepository';
import { AccountAssociationService } from '../services/accountAssociation';

interface SyncResult {
  callId: string;
  status: 'success' | 'error' | 'skipped';
  title?: string;
  error?: string;
  reason?: string;
}

interface LambdaSyncResult {
  success: boolean;
  platform: string;
  summary: {
    total: number;
    processed: number;
    skipped: number;
    errors: number;
  };
  details: SyncResult[];
  executionTime: number;
  errorMessage?: string;
}

/**
 * AWS Lambda function for periodic Gong transcript synchronization
 * Triggered by EventBridge/CloudWatch Events on a schedule (e.g., every 4 hours)
 */
export const handler = async (event: ScheduledEvent, context: Context): Promise<LambdaSyncResult> => {
  const startTime = Date.now();
  console.log('🔄 Starting periodic Gong sync lambda', { 
    time: event.time,
    source: event.source,
    region: event.region 
  });

  // Configuration from environment variables
  const platform = 'gong';
  const days = parseInt(process.env.SYNC_DAYS || '1'); // Default: last 24 hours
  const limit = parseInt(process.env.SYNC_LIMIT || '100'); // Default: 100 calls max
  const region = process.env.AWS_REGION || 'us-east-1'; // AWS_REGION is automatically available in Lambda

  try {
    // Initialize services
    const transcriptRepo = new TranscriptRepository();
    const accountService = new AccountAssociationService(transcriptRepo);
    
    // Create platform client
    console.log(`🔑 Authenticating with ${platform} API...`);
    const client = PlatformFactory.createClient(platform as PlatformType, `${platform}-api-credentials`, region);
    await client.authenticate();

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    console.log(`📞 Fetching calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get recent calls
    const calls = await client.listCalls({
      startDate,
      endDate,
      limit
    });

    console.log(`📋 Found ${calls.length} calls from ${platform}`);

    // Process each call
    const results = {
      processed: 0,
      errors: 0,
      skipped: 0,
      details: [] as SyncResult[]
    };

    for (const call of calls) {
      try {
        // Check if transcript already exists
        const existing = await transcriptRepo.getTranscriptById(call.id);
        if (existing) {
          results.skipped++;
          results.details.push({ 
            callId: call.id, 
            status: 'skipped', 
            reason: 'already_exists',
            title: call.title 
          });
          continue;
        }

        // Get full transcript with participant data
        console.log(`📝 Processing transcript for call: ${call.id}`);
        const transcript = await client.getTranscript(call.id);

        // Use account association service
        const accountResult = await accountService.determineAccountAssociation(transcript);
        
        // Store transcript
        await transcriptRepo.createTranscript(transcript, accountResult.accountId);
        
        results.processed++;
        results.details.push({ 
          callId: call.id, 
          status: 'success', 
          title: call.title 
        });
        
        console.log(`✅ Successfully processed call: ${call.id}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to process call ${call.id}:`, errorMessage);
        
        results.errors++;
        results.details.push({ 
          callId: call.id, 
          status: 'error', 
          error: errorMessage,
          title: call.title 
        });
      }
    }

    const executionTime = Date.now() - startTime;
    
    console.log(`🎉 Sync completed in ${executionTime}ms:`, {
      processed: results.processed,
      skipped: results.skipped, 
      errors: results.errors,
      total: calls.length
    });

    return {
      success: true,
      platform,
      summary: {
        total: calls.length,
        processed: results.processed,
        skipped: results.skipped,
        errors: results.errors
      },
      details: results.details,
      executionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('💥 Lambda sync failed:', errorMessage);

    return {
      success: false,
      platform,
      summary: { total: 0, processed: 0, skipped: 0, errors: 1 },
      details: [],
      executionTime,
      errorMessage
    };
  }
};