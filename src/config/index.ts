import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },
  platforms: {
    gong: {
      enabled: process.env.GONG_ENABLED === 'true',
      secretName: 'gong-api-credentials'
    },
    clari: {
      enabled: process.env.CLARI_ENABLED === 'true',
      secretName: 'clari-api-credentials'
    },
    fireflies: {
      enabled: process.env.FIREFLIES_ENABLED === 'true',
      secretName: 'fireflies-api-credentials'
    },
    fathom: {
      enabled: process.env.FATHOM_ENABLED === 'true',
      secretName: 'fathom-api-credentials'
    },
    otter: {
      enabled: process.env.OTTER_ENABLED === 'true',
      secretName: 'otter-api-credentials'
    }
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'bedrock', // bedrock or openai
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    bedrockRegion: process.env.BEDROCK_REGION || 'us-east-1'
  }
};

export function validateConfig(): void {
  if (!config.supabase.url || !config.supabase.serviceKey) {
    console.warn('⚠️  Supabase credentials not configured. Stored transcripts will not work.');
  }
  
  const enabledPlatforms = Object.entries(config.platforms)
    .filter(([_, settings]) => settings.enabled)
    .map(([name]) => name);
    
  if (enabledPlatforms.length === 0) {
    console.warn('⚠️  No platforms enabled. Set PLATFORM_NAME_ENABLED=true in your environment.');
  } else {
    console.log(`✅ Enabled platforms: ${enabledPlatforms.join(', ')}`);
  }
}