import { GraphQLClient } from 'graphql-request';
import { config } from '../config';
import { FirefliesTranscript } from '../types';

export class FirefliesService {
  private client: GraphQLClient;

  constructor() {
    this.client = new GraphQLClient(config.fireflies.apiUrl, {
      headers: {
        'Authorization': `Bearer ${config.fireflies.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getTranscripts(limit: number = 50, skip: number = 0): Promise<FirefliesTranscript[]> {
    const query = `
      query GetTranscripts($limit: Int!, $skip: Int!) {
        transcripts(limit: $limit, skip: $skip) {
          id
          title
          transcript
          date
          duration
          meeting_attendees {
            displayName
            email
            phoneNumber
          }
          summary {
            overview
          }
        }
      }
    `;

    try {
      const response: any = await this.client.request(query, { limit, skip });
      
      return response.transcripts.map((t: any) => ({
        id: t.id,
        title: t.title,
        transcript_text: t.transcript,
        date: t.date,
        duration: t.duration,
        meeting_attendees: t.meeting_attendees || [],
        summary: t.summary?.overview,
      }));
    } catch (error) {
      console.error('Error fetching transcripts from Fireflies:', error);
      throw error;
    }
  }

  async getTranscriptById(id: string): Promise<FirefliesTranscript | null> {
    const query = `
      query GetTranscript($transcriptId: String!) {
        transcript(id: $transcriptId) {
          id
          title
          transcript
          date
          duration
          meeting_attendees {
            displayName
            email
            phoneNumber
          }
          summary {
            overview
          }
        }
      }
    `;

    try {
      const response: any = await this.client.request(query, { transcriptId: id });
      
      if (!response.transcript) {
        return null;
      }

      const t = response.transcript;
      return {
        id: t.id,
        title: t.title,
        transcript_text: t.transcript,
        date: t.date,
        duration: t.duration,
        meeting_attendees: t.meeting_attendees || [],
        summary: t.summary?.overview,
      };
    } catch (error) {
      console.error(`Error fetching transcript ${id} from Fireflies:`, error);
      throw error;
    }
  }

  async getRecentTranscripts(since: Date): Promise<FirefliesTranscript[]> {
    const query = `
      query GetRecentTranscripts($startTime: DateTime!) {
        transcripts(startTime: $startTime, limit: 100) {
          id
          title
          transcript
          date
          duration
          meeting_attendees {
            displayName
            email
            phoneNumber
          }
          summary {
            overview
          }
        }
      }
    `;

    try {
      const response: any = await this.client.request(query, { 
        startTime: since.toISOString() 
      });
      
      return response.transcripts.map((t: any) => ({
        id: t.id,
        title: t.title,
        transcript_text: t.transcript,
        date: t.date,
        duration: t.duration,
        meeting_attendees: t.meeting_attendees || [],
        summary: t.summary?.overview,
      }));
    } catch (error) {
      console.error('Error fetching recent transcripts from Fireflies:', error);
      throw error;
    }
  }
}