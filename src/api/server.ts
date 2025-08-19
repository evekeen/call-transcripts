import express from 'express';
import { config, validateConfig } from '../config';
import { TranscriptRepository } from '../database/repositories/transcriptRepository';
import { PlatformFactory, PlatformType } from '../integrations/platformFactory';
import path from 'path';

export class ApiServer {
  private app: express.Application;
  private transcriptRepo: TranscriptRepository;

  constructor() {
    this.app = express();
    validateConfig();
    this.transcriptRepo = new TranscriptRepository();
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