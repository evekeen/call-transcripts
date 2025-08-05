export interface ClariAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface ClariCall {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  participants: ClariParticipant[];
  recordingUrl?: string;
  meetingType?: string;
  status?: string;
  externalId?: string;
}

export interface ClariParticipant {
  email: string;
  name?: string;
  role?: 'host' | 'attendee';
  company?: string;
  userId?: string;
}

export interface ClariTranscriptSegment {
  speakerId: string;
  speakerName?: string;
  speakerEmail?: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface ClariTranscript {
  callId: string;
  segments: ClariTranscriptSegment[];
  language?: string;
  duration: number;
}

export interface ClariListCallsRequest {
  startDate: string;
  endDate: string;
  limit?: number;
  offset?: number;
  status?: 'completed' | 'in_progress' | 'scheduled';
}

export interface ClariListCallsResponse {
  calls: ClariCall[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ClariAIInsights {
  callId: string;
  summary?: string;
  actionItems?: string[];
  topics?: {
    name: string;
    duration: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
  }[];
  questions?: string[];
  risks?: string[];
  opportunities?: string[];
}

export interface ClariWebhookPayload {
  event: 'call.completed' | 'call.transcribed' | 'call.analyzed';
  callId: string;
  timestamp: string;
  data?: {
    title: string;
    startTime: string;
    endTime: string;
    participants: string[];
  };
}

export interface ClariErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  statusCode: number;
}