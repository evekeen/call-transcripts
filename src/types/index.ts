export interface FirefliesTranscript {
  id: string;
  title: string;
  transcript_text: string;
  date: string;
  duration: number;
  meeting_attendees: Attendee[];
  summary?: string;
}

export interface Attendee {
  displayName: string;
  email?: string;
  phoneNumber?: string;
}

export interface ClientAccount {
  id: string;
  name: string;
  domain: string;
  grouping_rule: 'domain' | 'manual' | 'title_pattern';
  created_at: string;
  updated_at: string;
}

export interface TranscriptRecord {
  id: string;
  fireflies_id: string;
  client_account_id: string;
  title: string;
  transcript_text: string;
  date: string;
  duration: number;
  attendees: string; // JSON string
  summary?: string;
  created_at: string;
  updated_at: string;
}

export interface GroupingRule {
  type: 'domain' | 'manual' | 'title_pattern';
  value: string;
  client_account_id: string;
}

export interface QueryRequest {
  question: string;
  client_account_id?: string;
  limit?: number;
}

export interface QueryResponse {
  answer: string;
  relevant_transcripts: TranscriptExcerpt[];
  confidence: number;
}

export interface TranscriptExcerpt {
  transcript_id: string;
  title: string;
  date: string;
  excerpt: string;
  relevance_score: number;
}