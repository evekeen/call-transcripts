export interface GongAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// Official Gong API response structure based on /v2/calls endpoint documentation
export interface GongCall {
  id: string; // Call ID like "7782342274025937895"
  url: string; // Direct link to call in Gong UI
  title: string;
  scheduled: string; // ISO timestamp string
  started: string; // ISO timestamp string
  duration: number; // Duration in seconds
  primaryUserId: string; // Primary user ID like "234599484848423"
  direction: 'Inbound' | 'Outbound' | 'Internal' | 'Conference';
  system: string; // System name like "Outreach", "Google Meet", "Zoom", etc.
  scope: 'Internal' | 'External';
  media: 'Audio' | 'Video';
  language: string; // Language code like "eng"
  workspaceId: string;
  sdrDisposition: string | null; // e.g., "Got the gatekeeper"
  clientUniqueId: string | null;
  customData: string | null; // e.g., "Conference Call"
  purpose: string | null; // e.g., "Demo Call"
  meetingUrl: string | null; // e.g., "https://zoom.us/j/123"
  isPrivate: boolean;
  calendarEventId: string | null;
}

export interface GongParticipant {
  id: string;
  speakerId: string;
  emailAddress: string;
  name?: string;
  userId?: string;
  affiliation?: 'Internal' | 'External';
  phoneNumber?: string;
  methods?: string[];
  displayName?: string; // Legacy field for backward compatibility
  title?: string;
  companyName?: string;
  context?: {
    active: boolean;
    talkTime: number;
  };
}

// Official Gong API transcript response structure from POST /v2/calls/transcript
export interface GongTranscriptSegment {
  speakerId: string;
  topic?: string; // Optional topic classification like "Call Setup", "Objections", etc.
  sentences: GongSentence[];
}

export interface GongSentence {
  start: number; // Start time in milliseconds
  end: number;   // End time in milliseconds  
  text: string;  // The actual spoken text
}

export interface GongTranscriptResponse {
  requestId: string; // For troubleshooting/debugging
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string; // For pagination if more pages exist
  };
  callTranscripts: {
    callId: string;
    transcript: GongTranscriptSegment[];
  }[];
}

// Legacy interface for backward compatibility
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

// Official Gong API transcript request structure for POST /v2/calls/transcript
export interface GongTranscriptRequest {
  filter: {
    callIds: string[]; // Array of call IDs to retrieve transcripts for
    // Optional additional filters could be added here per API docs
  };
}

// Gong API extensive call request structure for POST /v2/calls/extensive
export interface GongExtensiveCallRequest {
  filter: {
    callIds: string[]; // Array of call IDs to retrieve extensive data for
  };
  contentSelector: {
    exposedFields: {
      parties?: string[]; // Fields to include for parties: ["id", "speakerId", "emailAddress", "name", "userId", "affiliation", "phoneNumber", "methods"]
      content?: string[]; // Additional content fields if needed
    };
  };
}

// Gong API extensive call response structure
export interface GongExtensiveCallResponse {
  requestId: string;
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  calls: GongExtensiveCall[];
}

export interface GongExtensiveCall {
  metaData: {
    id: string;
    // Other metadata fields would be here
  };
  parties?: GongParticipant[]; // Only included if requested in contentSelector
  // Other extensive call data would go here
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