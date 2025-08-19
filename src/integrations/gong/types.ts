export interface GongAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// Actual Gong API response structure based on /v2/calls endpoint
export interface GongCall {
  id: string;
  url: string;
  title: string;
  scheduled: string; // ISO datetime string
  started: string; // ISO datetime string  
  duration: number; // seconds
  primaryUserId: string;
  direction: 'Inbound' | 'Outbound' | 'Internal' | 'Conference';
  system: string; // e.g., "Google Meet", "Zoom", etc.
  scope: 'Internal' | 'External';
  media: 'Audio' | 'Video';
  language: string; // e.g., "eng"
  workspaceId: string;
  sdrDisposition: string | null;
  clientUniqueId: string | null;
  customData: any | null;
  purpose: string | null;
  meetingUrl: string | null;
  isPrivate: boolean;
  calendarEventId: string | null;
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

// Actual Gong API response structure for /v2/calls endpoint
export interface GongListCallsResponse {
  requestId: string;
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string; // Only present if there are more pages
  };
  calls: GongCall[];
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