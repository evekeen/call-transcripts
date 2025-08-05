export interface GongAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface GongCall {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  participants: GongParticipant[];
  recordingUrl?: string;
  direction: 'inbound' | 'outbound' | 'internal';
  purpose?: string;
  meetingUrl?: string;
  language?: string;
  workspaceId?: string;
}

export interface GongParticipant {
  emailAddress: string;
  displayName?: string;
  title?: string;
  companyName?: string;
  userId?: string;
  speakerId?: string;
  context?: {
    active: boolean;
    talkTime: number;
  };
}

export interface GongTranscriptSegment {
  speakerId: string;
  speakerName?: string;
  topic?: string;
  sentences: GongSentence[];
}

export interface GongSentence {
  start: number;
  end: number;
  text: string;
}

export interface GongTranscript {
  callId: string;
  transcript: GongTranscriptSegment[];
}

export interface GongListCallsRequest {
  startDate: string;
  endDate: string;
  workspaceId?: string;
  cursor?: string;
  limit?: number;
}

export interface GongListCallsResponse {
  calls: GongCall[];
  totalRecords: number;
  currentPageSize: number;
  currentPageNumber: number;
  cursor?: string;
}

export interface GongAIContent {
  callId: string;
  summary?: string;
  highlights?: string[];
  nextSteps?: string[];
  questions?: string[];
  topics?: {
    name: string;
    duration: number;
  }[];
}

export interface GongWebhookPayload {
  eventType: 'CALL_PROCESSING_COMPLETED' | 'CALL_CREATED' | 'CALL_UPDATED';
  callId: string;
  workspaceId?: string;
  timestamp: string;
  callData?: {
    title: string;
    startTime: string;
    endTime: string;
  };
}

export interface GongErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
  };
}