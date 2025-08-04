import dotenv from 'dotenv';

dotenv.config();

export const config = {
  fireflies: {
    apiKey: process.env.FIREFLIES_API_KEY || '',
    apiUrl: 'https://api.fireflies.ai/graphql',
    maxRequestsPerDay: parseInt(process.env.MAX_REQUESTS_PER_DAY || '45'),
    pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '60'),
  },
  database: {
    path: process.env.DATABASE_PATH || './data/sales_intelligence.db',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  llm: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },
};

export function validateConfig(): void {
  if (!config.fireflies.apiKey) {
    throw new Error('FIREFLIES_API_KEY is required');
  }
}