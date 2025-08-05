// Jest setup file
process.env.NODE_ENV = 'test';

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// Extend Jest matchers if needed
expect.extend({});

// Global test utilities
global.console = {
  ...console,
  // Suppress console.log during tests unless explicitly needed
  log: jest.fn(),
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn,
  info: jest.fn(),
  debug: jest.fn(),
};