export interface CallMetadata {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  attendees: Attendee[];
  recordingUrl?: string;
  platform: 'gong' | 'clari' | 'fathom' | 'fireflies' | 'otter';
}

export interface Attendee {
  email: string;
  name?: string;
  role?: 'host' | 'participant';
  company?: string;
}

export interface TranscriptSegment {
  speaker: string;
  speakerEmail?: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface Transcript {
  callId: string;
  segments: TranscriptSegment[];
  fullText: string;
  metadata: CallMetadata;
}

export interface PlatformCredentials {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ListCallsOptions {
  startDate: Date;
  endDate: Date;
  limit?: number;
  offset?: number;
}

export interface PlatformAdapter {
  name: string;
  
  authenticate(credentials?: PlatformCredentials): Promise<void>;
  
  listCalls(options: ListCallsOptions): Promise<CallMetadata[]>;
  
  getTranscript(callId: string): Promise<Transcript>;
  
  getAIContent?(callId: string): Promise<any>;
  
  setupWebhook?(webhookUrl: string): Promise<void>;
  
  testConnection(): Promise<boolean>;
  
  refreshAuth?(): Promise<void>;
}