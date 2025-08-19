import express from 'express';
import { config, validateConfig } from '../config';
import { TranscriptRepository } from '../database/repositories/transcriptRepository';
import { PlatformFactory, PlatformType } from '../integrations/platformFactory';
import { AccountAssociationService } from '../services/accountAssociation';
import path from 'path';

export class ApiServer {
  private app: express.Application;
  private transcriptRepo: TranscriptRepository;
  private accountService: AccountAssociationService;

  constructor() {
    this.app = express();
    validateConfig();
    this.transcriptRepo = new TranscriptRepository();
    this.accountService = new AccountAssociationService(this.transcriptRepo);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Multi-platform API endpoints
    this.app.get('/api/:platform/calls', async (req, res) => {
      try {
        const { platform } = req.params;
        const { startDate, endDate, limit = 50 } = req.query;
        
        if (!this.isValidPlatform(platform)) {
          return res.status(400).json({ error: 'Invalid platform. Supported platforms: gong, clari, fireflies, fathom, otter' });
        }
        
        const client = PlatformFactory.createClient(
          platform as PlatformType, 
          `${platform}-api-credentials`,
          process.env.AWS_REGION
        );
        
        await client.authenticate();
        
        const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate as string) : new Date();
        
        const calls = await client.listCalls({
          startDate: start,
          endDate: end,
          limit: parseInt(limit as string)
        });
        
        res.json(calls);
      } catch (error) {
        console.error(`Get ${req.params.platform} calls error:`, error);
        res.status(500).json({ error: `Failed to get ${req.params.platform} calls` });
      }
    });

    this.app.get('/api/:platform/transcripts/:callId', async (req, res) => {
      try {
        const { platform, callId } = req.params;
        
        if (!this.isValidPlatform(platform)) {
          return res.status(400).json({ error: 'Invalid platform. Supported platforms: gong, clari, fireflies, fathom, otter' });
        }
        
        const client = PlatformFactory.createClient(
          platform as PlatformType, 
          `${platform}-api-credentials`,
          process.env.AWS_REGION
        );
        
        await client.authenticate();
        const transcript = await client.getTranscript(callId);
        
        res.json(transcript);
      } catch (error) {
        console.error(`Get ${req.params.platform} transcript error:`, error);
        res.status(500).json({ error: `Failed to get ${req.params.platform} transcript` });
      }
    });

    this.app.get('/api/transcripts', async (req, res) => {
      try {
        const { accountIds, platforms, startDate, endDate, query, limit = 50, offset = 0 } = req.query;
        
        const searchOptions: any = {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        };
        
        if (accountIds) {
          searchOptions.accountIds = (accountIds as string).split(',');
        }
        
        if (platforms) {
          searchOptions.platforms = (platforms as string).split(',');
        }
        
        if (startDate) {
          searchOptions.startDate = new Date(startDate as string);
        }
        
        if (endDate) {
          searchOptions.endDate = new Date(endDate as string);
        }
        
        if (query) {
          searchOptions.query = query as string;
        }
        
        const result = await this.transcriptRepo.searchTranscripts(searchOptions);
        res.json(result);
      } catch (error) {
        console.error('Search transcripts error:', error);
        res.status(500).json({ error: 'Failed to search transcripts' });
      }
    });

    this.app.get('/api/transcripts/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const transcript = await this.transcriptRepo.getTranscriptById(id);
        
        if (!transcript) {
          return res.status(404).json({ error: 'Transcript not found' });
        }
        
        res.json(transcript);
      } catch (error) {
        console.error('Get transcript error:', error);
        res.status(500).json({ error: 'Failed to get transcript' });
      }
    });

    // Sync endpoint to pull calls and store in Supabase
    this.app.post('/api/:platform/sync', async (req, res) => {
      try {
        const { platform } = req.params;
        const { days = 7, limit = 50 } = req.body;
        
        if (!this.isValidPlatform(platform)) {
          return res.status(400).json({ error: 'Invalid platform. Supported platforms: gong, clari, fireflies, fathom, otter' });
        }

        console.log(`Starting sync for ${platform} platform - last ${days} days, limit ${limit}`);

        // Create platform client
        const client = PlatformFactory.createClient(platform as PlatformType, `${platform}-api-credentials`);
        await client.authenticate();

        // Get recent calls
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const calls = await client.listCalls({
          startDate,
          endDate,
          limit
        });

        console.log(`Found ${calls.length} calls from ${platform}`);

        // Process each call and store transcript
        const results = {
          processed: 0,
          errors: 0,
          skipped: 0,
          details: [] as any[]
        };

        for (const call of calls) {
          try {
            // Check if transcript already exists
            const existingResult = await this.transcriptRepo.getTranscriptById(call.id);
            const existing = existingResult?.data;
            if (existing) {
              results.skipped++;
              results.details.push({ callId: call.id, status: 'skipped', reason: 'already_exists' });
              continue;
            }

            // Get full transcript with participant data
            const transcript = await client.getTranscript(call.id);

            // Use account association service to determine account
            const accountResult = await this.accountService.determineAccountAssociation(transcript);
            
            // Store transcript using repository
            await this.transcriptRepo.createTranscript(transcript, accountResult.accountId);
            
            results.processed++;
            results.details.push({ callId: call.id, status: 'success', title: call.title });
            
          } catch (error: any) {
            console.error(`Failed to process call ${call.id}:`, error.message);
            results.errors++;
            results.details.push({ callId: call.id, status: 'error', error: error.message });
          }
        }

        console.log(`Sync completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors`);

        res.json({
          success: true,
          platform,
          summary: {
            total: calls.length,
            processed: results.processed,
            skipped: results.skipped,
            errors: results.errors
          },
          details: results.details
        });

      } catch (error: any) {
        console.error(`Sync failed for ${req.params.platform}:`, error);
        res.status(500).json({ 
          error: 'Sync failed', 
          message: error.message 
        });
      }
    });

  }

  private isValidPlatform(platform: string): boolean {
    const validPlatforms = ['gong', 'clari', 'fireflies', 'fathom', 'otter'];
    return validPlatforms.includes(platform.toLowerCase());
  }

  public start(): void {
    const port = config.server.port;
    this.app.listen(port, () => {
      console.log(`🎯 Multi-Platform Sales Intelligence API running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`🌐 Web interface: http://localhost:${port}`);
      console.log(`📞 Platform APIs: http://localhost:${port}/api/{platform}/calls`);
      console.log(`🔗 Supported platforms: gong, clari, fireflies, fathom, otter`);
    });
  }
}