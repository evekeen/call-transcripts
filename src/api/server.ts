import express from 'express';
import { config } from '../config';
import { SyncService } from '../services/sync';
import { QueryService } from '../services/query';
import { Database } from '../database';

export class ApiServer {
  private app: express.Application;
  private syncService: SyncService;
  private queryService: QueryService;
  private db: Database;

  constructor() {
    this.app = express();
    this.syncService = new SyncService();
    this.queryService = new QueryService();
    this.db = new Database();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
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

    // Sync endpoints
    this.app.post('/sync/full', async (req, res) => {
      try {
        await this.syncService.syncAllTranscripts();
        res.json({ message: 'Full sync started successfully' });
      } catch (error) {
        console.error('Full sync error:', error);
        res.status(500).json({ error: 'Failed to start full sync' });
      }
    });

    this.app.post('/sync/recent', async (req, res) => {
      try {
        await this.syncService.syncRecentTranscripts();
        res.json({ message: 'Recent sync completed successfully' });
      } catch (error) {
        console.error('Recent sync error:', error);
        res.status(500).json({ error: 'Failed to sync recent transcripts' });
      }
    });

    this.app.get('/sync/status', async (req, res) => {
      try {
        const status = await this.syncService.getStatus();
        res.json(status);
      } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
      }
    });

    // Query endpoints
    this.app.post('/query', async (req, res) => {
      try {
        const { question, client_account_id, limit } = req.body;
        
        if (!question) {
          return res.status(400).json({ error: 'Question is required' });
        }

        const result = await this.queryService.queryTranscripts({
          question,
          client_account_id,
          limit,
        });

        res.json(result);
      } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({ error: 'Failed to process query' });
      }
    });

    // Client account endpoints
    this.app.get('/clients', async (req, res) => {
      try {
        const clients = await this.db.getClientAccounts();
        res.json(clients);
      } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ error: 'Failed to get client accounts' });
      }
    });

    this.app.get('/clients/:id/transcripts', async (req, res) => {
      try {
        const { id } = req.params;
        const transcripts = await this.db.getTranscriptsByClient(id);
        res.json(transcripts);
      } catch (error) {
        console.error('Get client transcripts error:', error);
        res.status(500).json({ error: 'Failed to get client transcripts' });
      }
    });

    // Webhook endpoint for Fireflies
    this.app.post('/webhook/fireflies', (req, res) => {
      try {
        console.log('Received Fireflies webhook:', req.body);
        
        // Queue the transcript for processing
        // This would trigger a background job to fetch and process the new transcript
        
        res.json({ message: 'Webhook received successfully' });
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
      }
    });
  }

  public start(): void {
    const port = config.server.port;
    this.app.listen(port, () => {
      console.log(`🔥 Fireflies Sales Intelligence API running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
    });
  }
}