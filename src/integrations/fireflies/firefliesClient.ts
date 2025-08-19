import { GraphQLClient } from 'graphql-request';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  PlatformAdapter,
  PlatformCredentials,
  ListCallsOptions,
  CallMetadata,
  Transcript,
  Attendee,
  TranscriptSegment
} from '../base/platformAdapter';
import {
  FirefliesTranscript,
  FirefliesGraphQLResponse,
  TranscriptsQueryResponse,
  TranscriptQueryResponse,
  FirefliesSummary,
  FirefliesErrorResponse
} from './types';

export class FirefliesClient implements PlatformAdapter {
  name = 'fireflies';
  private graphqlClient: GraphQLClient;
  private credentials: PlatformCredentials;
  private secretsManager: SecretsManagerClient;

  constructor(private secretName: string, region: string = 'us-east-1') {
    const endpoint = process.env.FIREFLIES_GRAPHQL_ENDPOINT || 'https://api.fireflies.ai/graphql';
    this.graphqlClient = new GraphQLClient(endpoint);
    
    this.secretsManager = new SecretsManagerClient({ region });
    this.credentials = {};
  }

  async authenticate(credentials?: PlatformCredentials): Promise<void> {
    if (credentials) {
      this.credentials = credentials;
    } else {
      try {
        await this.loadCredentialsFromSecrets();
      } catch (error) {
        console.warn('AWS Secrets Manager not available, trying environment variables...');
        this.loadCredentialsFromEnv();
      }
    }

    if (!this.credentials.apiKey) {
      throw new Error('Missing Fireflies API key. Set FIREFLIES_API_KEY environment variable or configure AWS Secrets Manager.');
    }

    this.graphqlClient.setHeader('Authorization', `Bearer ${this.credentials.apiKey}`);
  }

  private async loadCredentialsFromSecrets(): Promise<void> {
    try {
      const command = new GetSecretValueCommand({ SecretId: this.secretName });
      const response = await this.secretsManager.send(command);
      
      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        this.credentials = {
          apiKey: secrets.apiKey
        };
      } else {
        throw new Error('No secret string found');
      }
    } catch (error) {
      throw new Error('Failed to load Fireflies credentials from AWS Secrets Manager');
    }
  }

  private loadCredentialsFromEnv(): void {
    this.credentials = {
      apiKey: process.env.FIREFLIES_API_KEY
    };
  }

  async refreshAuth(): Promise<void> {
    // Fireflies uses API key auth, so just re-authenticate
    await this.authenticate();
  }

  async testConnection(): Promise<boolean> {
    try {
      const query = `
        query TestConnection {
          user {
            id
            email
          }
        }
      `;
      
      const response: any = await this.graphqlClient.request(query);
      return !!response.user;
    } catch (error) {
      console.error('Fireflies connection test failed:', error);
      return false;
    }
  }

  async listCalls(options: ListCallsOptions): Promise<CallMetadata[]> {
    const calls: CallMetadata[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    const limit = options.limit || 100;

    const query = `
      query ListTranscripts($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!, $skip: Int) {
        transcripts(
          fromDate: $fromDate
          toDate: $toDate
          limit: $limit
          skip: $skip
        ) {
          id
          title
          date
          duration
          meeting_attendees {
            displayName
            email
            name
          }
          audio_url
          video_url
        }
      }
    `;

    try {
      let skip = 0;
      const batchSize = Math.min(50, limit); // Fireflies max 50 per request
      
      while (calls.length < limit) {
        const variables = {
          fromDate: options.startDate.toISOString(),
          toDate: options.endDate.toISOString(),
          limit: Math.min(batchSize, limit - calls.length),
          skip
        };

        const response: { transcripts: FirefliesTranscript[] } = await this.graphqlClient.request(query, variables);
        
        if (!response.transcripts || response.transcripts.length === 0) {
          break;
        }

        const mappedCalls = response.transcripts.map(transcript => 
          this.mapFirefliesTranscriptToMetadata(transcript)
        );
        calls.push(...mappedCalls);
        
        // If we got fewer results than requested, we've reached the end
        if (response.transcripts.length < variables.limit) {
          break;
        }
        
        skip += response.transcripts.length;

        // Be respectful of rate limits (50 req/day for free tier)
        if (calls.length < limit) {
          await this.delay(1200); // Space out requests
        }
      }

      return calls.slice(0, limit);
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getTranscript(callId: string): Promise<Transcript> {
    const query = `
      query GetTranscript($id: String!) {
        transcript(id: $id) {
          id
          title
          date
          duration
          meeting_attendees {
            displayName
            email
            name
          }
          sentences {
            index
            speaker_name
            speaker_email
            text
            start_time
            end_time
          }
          summary {
            overview
            action_items
            outline
            keywords
            notes
            questions {
              question
              answer
              timestamp
            }
          }
          audio_url
          video_url
          transcript_url
        }
      }
    `;

    try {
      const response = await this.graphqlClient.request<TranscriptQueryResponse>(
        query,
        { id: callId }
      );

      if (!response.transcript) {
        throw new Error(`Transcript not found for call ID: ${callId}`);
      }

      const firefliesTranscript = response.transcript;
      
      const segments: TranscriptSegment[] = firefliesTranscript.sentences.map(sentence => ({
        speaker: sentence.speaker_name,
        speakerEmail: sentence.speaker_email,
        text: sentence.text,
        startTime: sentence.start_time * 1000, // Convert to milliseconds
        endTime: sentence.end_time * 1000
      }));

      const fullText = segments.map(s => s.text).join(' ');

      return {
        callId,
        segments,
        fullText,
        metadata: this.mapFirefliesTranscriptToMetadata(firefliesTranscript)
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getAIContent(callId: string): Promise<FirefliesSummary | null> {
    const query = `
      query GetAIContent($id: String!) {
        transcript(id: $id) {
          summary {
            overview
            action_items
            outline
            keywords
            notes
            questions {
              question
              answer
              timestamp
            }
          }
        }
      }
    `;

    try {
      const response = await this.graphqlClient.request<TranscriptQueryResponse>(
        query,
        { id: callId }
      );

      return response.transcript?.summary || null;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async setupWebhook(webhookUrl: string): Promise<void> {
    const mutation = `
      mutation CreateWebhook($url: String!, $events: [String!]!) {
        createWebhook(url: $url, events: $events) {
          id
          url
          events
          active
        }
      }
    `;

    try {
      await this.graphqlClient.request(mutation, {
        url: webhookUrl,
        events: ['transcription_complete']
      });
      console.log('Fireflies webhook configured successfully');
    } catch (error) {
      console.error('Failed to setup Fireflies webhook:', error);
      throw error;
    }
  }

  private mapFirefliesTranscriptToMetadata(transcript: FirefliesTranscript): CallMetadata {
    const attendees: Attendee[] = transcript.meeting_attendees.map(attendee => ({
      email: attendee.email,
      name: attendee.displayName || attendee.name,
      role: 'participant' // Fireflies doesn't distinguish host/participant
    }));

    return {
      id: transcript.id,
      title: transcript.title,
      startTime: new Date(transcript.date),
      endTime: new Date(new Date(transcript.date).getTime() + transcript.duration * 1000),
      duration: transcript.duration,
      attendees,
      recordingUrl: transcript.audio_url || transcript.video_url,
      platform: 'fireflies'
    };
  }

  private handleApiError(error: any): void {
    if (error.response?.errors) {
      const errors = error.response.errors as FirefliesErrorResponse['errors'];
      const errorMessage = errors.map(e => e.message).join('; ');
      
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
        throw new Error('Fireflies authentication failed. Check API key.');
      } else if (errorMessage.includes('rate limit')) {
        throw new Error('Fireflies API rate limit exceeded. Free tier: 50 req/day, Enterprise: higher limits.');
      } else {
        throw new Error(`Fireflies API error: ${errorMessage}`);
      }
    }
    throw error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}