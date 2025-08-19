import { ApiServer } from './api/server';

// Simple entry point to start the web server
const server = new ApiServer();
server.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});