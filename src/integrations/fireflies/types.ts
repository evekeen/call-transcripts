export interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  duration: number;
  meeting_attendees: FirefliesAttendee[];
  sentences: FirefliesSentence[];
  summary?: FirefliesSummary;
  audio_url?: string;
  video_url?: string;
  transcript_url?: string;
}

export interface FirefliesAttendee {
  displayName: string;
  email: string;
  name?: string;
  phoneNumber?: string;
  location?: string;
}

export interface FirefliesSentence {
  index: number;
  speaker_name: string;
  speaker_email?: string;
  text: string;
  start_time: number;
  end_time: number;
  raw_text?: string;
}

export interface FirefliesSummary {
  overview?: string;
  action_items?: string[];
  outline?: string[];
  keywords?: string[];
  notes?: string;
  questions?: FirefliesQuestion[];
}

export interface FirefliesQuestion {
  question: string;
  answer?: string;
  timestamp?: number;
}

export interface FirefliesUser {
  id: string;
  email: string;
  name?: string;
  minutes_consumed?: number;
  is_admin?: boolean;
  integrations?: string[];
}

export interface FirefliesGraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code: string;
      [key: string]: any;
    };
  }>;
}

export interface TranscriptsQueryResponse {
  transcripts: {
    edges: Array<{
      node: FirefliesTranscript;
      cursor: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
    totalCount: number;
  };
}

export interface TranscriptQueryResponse {
  transcript: FirefliesTranscript;
}

export interface FirefliesWebhookPayload {
  event: 'transcription_complete' | 'meeting_scheduled' | 'meeting_started';
  transcriptId?: string;
  meetingId?: string;
  title?: string;
  timestamp: string;
  participants?: string[];
}

export interface FirefliesErrorResponse {
  errors: Array<{
    message: string;
    code?: string;
    path?: string[];
  }>;
}