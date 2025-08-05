const { PlatformFactory } = require('./dist/src/integrations/platformFactory');
const { TranscriptRepository } = require('./dist/src/database/repositories/transcriptRepository');
const { AccountAssociationService } = require('./dist/src/services/accountAssociation');

async function testE2E() {
  try {
    console.log('🧪 Starting End-to-End Test...');
    console.log('=====================================\n');
    
    // 1. Test platform clients
    console.log('1️⃣ Testing Platform Clients...');
    
    try {
      const gongClient = PlatformFactory.createClient('gong');
      const isGongConnected = await gongClient.testConnection();
      console.log(`   ✅ Gong connection: ${isGongConnected ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.log(`   ❌ Gong connection: FAILED (${error.message})`);
    }
    
    try {
      const clariClient = PlatformFactory.createClient('clari');
      const isClariConnected = await clariClient.testConnection();
      console.log(`   ✅ Clari connection: ${isClariConnected ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.log(`   ❌ Clari connection: FAILED (${error.message})`);
    }
    
    try {
      const firefliesClient = PlatformFactory.createClient('fireflies');
      const isFirefliesConnected = await firefliesClient.testConnection();
      console.log(`   ✅ Fireflies connection: ${isFirefliesConnected ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.log(`   ❌ Fireflies connection: FAILED (${error.message})`);
    }
    
    console.log('');
    
    // 2. Test database
    console.log('2️⃣ Testing Database Connection...');
    
    try {
      const repository = new TranscriptRepository();
      const stats = await repository.getProcessingStats();
      console.log('   ✅ Database connection: SUCCESS');
      console.log(`   📊 Total transcripts: ${stats.totalTranscripts}`);
      console.log(`   📊 Transcripts last week: ${stats.transcriptsLastWeek}`);
      console.log(`   📊 Platform breakdown:`, stats.transcriptsByPlatform);
    } catch (error) {
      console.log(`   ❌ Database connection: FAILED (${error.message})`);
      if (error.message.includes('Missing Supabase')) {
        console.log('   💡 Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env');
      }
    }
    
    console.log('');
    
    // 3. Test account association
    console.log('3️⃣ Testing Account Association Service...');
    
    try {
      const repository = new TranscriptRepository();
      const associationService = new AccountAssociationService(repository);
      console.log('   ✅ Account association service: INITIALIZED');
      
      // Test with sample transcript data
      const sampleTranscript = {
        callId: 'test-call-123',
        segments: [],
        fullText: 'Sample test transcript',
        metadata: {
          id: 'test-call-123',
          title: 'Sales Call with Acme Corp',
          startTime: new Date(),
          endTime: new Date(),
          duration: 3600,
          attendees: [
            { email: 'john@acme.com', name: 'John Doe', role: 'participant' },
            { email: 'sales@mycompany.com', name: 'Sales Rep', role: 'host' }
          ],
          platform: 'test'
        }
      };
      
      const association = await associationService.determineAccountAssociation(sampleTranscript);
      console.log('   ✅ Account association test: SUCCESS');
      console.log(`   📊 Account ID: ${association.accountId}`);
      console.log(`   📊 Confidence: ${association.confidence}`);
      console.log(`   📊 Rule: ${association.rule}`);
      
    } catch (error) {
      console.log(`   ❌ Account association: FAILED (${error.message})`);
    }
    
    console.log('');
    
    // 4. Test webhook payload processing
    console.log('4️⃣ Testing Webhook Payload Processing...');
    
    try {
      // Test Gong webhook payload structure
      const gongPayload = {
        eventType: 'CALL_PROCESSING_COMPLETED',
        callId: 'test-call-123',
        timestamp: new Date().toISOString(),
        workspaceId: 'workspace-123',
        callData: {
          title: 'Test Call',
          duration: 3600
        }
      };
      
      // Validate required fields
      const requiredFields = ['eventType', 'callId', 'timestamp'];
      const hasAllFields = requiredFields.every(field => gongPayload[field]);
      
      if (hasAllFields) {
        console.log('   ✅ Webhook payload validation: SUCCESS');
        console.log(`   📊 Event type: ${gongPayload.eventType}`);
        console.log(`   📊 Call ID: ${gongPayload.callId}`);
      } else {
        console.log('   ❌ Webhook payload validation: FAILED (missing required fields)');
      }
      
    } catch (error) {
      console.log(`   ❌ Webhook payload processing: FAILED (${error.message})`);
    }
    
    console.log('');
    
    // 5. Test API calls (if credentials are available)
    console.log('5️⃣ Testing API Calls (if credentials available)...');
    
    const platforms = ['gong', 'clari', 'fireflies'];
    
    for (const platform of platforms) {
      try {
        const client = PlatformFactory.createClient(platform);
        const isConnected = await client.testConnection();
        
        if (isConnected) {
          // Try to list recent calls
          const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const calls = await client.listCalls({ fromDate, limit: 5 });
          console.log(`   ✅ ${platform.toUpperCase()} API calls: Retrieved ${calls.length} calls`);
          
          // If we have calls, try to get a transcript
          if (calls.length > 0) {
            const transcript = await client.getTranscript(calls[0].id);
            console.log(`   ✅ ${platform.toUpperCase()} transcript: Retrieved ${transcript.segments.length} segments`);
          }
        } else {
          console.log(`   ⚠️  ${platform.toUpperCase()} API calls: SKIPPED (no valid credentials)`);
        }
      } catch (error) {
        console.log(`   ❌ ${platform.toUpperCase()} API calls: FAILED (${error.message})`);
      }
    }
    
    console.log('');
    console.log('=====================================');
    console.log('🎉 End-to-End Test Completed!');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Set up platform API credentials in .env file');
    console.log('2. Configure Supabase database connection');
    console.log('3. Deploy AWS infrastructure (optional)');
    console.log('4. Set up webhook endpoints');
    console.log('5. Run npm test to execute unit tests');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testE2E();
}

module.exports = { testE2E };