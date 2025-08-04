import * as cron from 'node-cron';
import { SyncService } from '../services/sync';
import { config } from '../config';

export class Scheduler {
  private syncService: SyncService;

  constructor() {
    this.syncService = new SyncService();
  }

  start(): void {
    console.log('🕐 Starting scheduler...');

    // Schedule recent transcript sync every hour during business hours (9 AM - 6 PM)
    cron.schedule('0 9-18 * * 1-5', async () => {
      console.log('🔄 Running scheduled recent sync...');
      try {
        await this.syncService.syncRecentTranscripts();
      } catch (error) {
        console.error('Scheduled recent sync failed:', error);
      }
    });

    // Schedule full sync once daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('🔄 Running scheduled full sync...');
      try {
        await this.syncService.syncAllTranscripts();
      } catch (error) {
        console.error('Scheduled full sync failed:', error);
      }
    });

    // Custom interval based on config
    const intervalMs = config.fireflies.pollIntervalMinutes * 60 * 1000;
    setInterval(async () => {
      console.log('🔄 Running custom interval sync...');
      try {
        await this.syncService.syncRecentTranscripts();
      } catch (error) {
        console.error('Custom interval sync failed:', error);
      }
    }, intervalMs);

    console.log('✅ Scheduler started successfully');
    console.log(`📅 Recent sync: Every hour during business hours`);
    console.log(`📅 Full sync: Daily at 2 AM`);
    console.log(`📅 Custom sync: Every ${config.fireflies.pollIntervalMinutes} minutes`);
  }
}