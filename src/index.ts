import { validateConfig } from './config';
import { ApiServer } from './api/server';
import { Scheduler } from './scheduler';

async function main() {
  try {
    console.log('🚀 Starting Fireflies Sales Intelligence Tool...');
    
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated');

    // Start API server
    const server = new ApiServer();
    server.start();

    // Start scheduler for automatic syncing
    const scheduler = new Scheduler();
    scheduler.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();