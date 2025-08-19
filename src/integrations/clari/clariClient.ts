import axios, { AxiosInstance, AxiosError } from 'axios';
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
  ClariAuthResponse,
  ClariCall,
  ClariListCallsResponse,
  ClariTranscript,
  ClariAIInsights,
  ClariErrorResponse,
  ClariTranscriptSegment
} from './types';

export class ClariClient implements PlatformAdapter {
  name = 'clari';
  private apiClient: AxiosInstance;
  private credentials: PlatformCredentials;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private secretsManager: SecretsManagerClient;

  constructor(private secretName: string, region: string = 'us-east-1') {
    this.apiClient = axios.create({
      baseURL: process.env.CLARI_BASE_URL || 'https://api.clari.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

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
      throw new Error('Missing Clari API key. Set CLARI_API_KEY environment variable or configure AWS Secrets Manager.');
    }

    // Clari uses API key authentication
    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    
    // If org password is provided, add it to headers
    if (this.credentials.clientSecret) {
      this.apiClient.defaults.headers.common['X-Org-Password'] = this.credentials.clientSecret;
    }
  }

  private async loadCredentialsFromSecrets(): Promise<void> {
    try {
      const command = new GetSecretValueCommand({ SecretId: this.secretName });
      const response = await this.secretsManager.send(command);
      
      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        this.credentials = {
          apiKey: secrets.apiKey,
          clientSecret: secrets.orgPassword // Org password for Clari
        };
      } else {
        throw new Error('No secret string found');
      }
    } catch (error) {
      console.error('Failed to load credentials from Secrets Manager:', error);
      throw new Error('Failed to load Clari credentials');
    }
  }

  private loadCredentialsFromEnv(): void {
    this.credentials = {
      apiKey: process.env.CLARI_API_KEY,
      clientSecret: process.env.CLARI_ORG_PASSWORD
    };
  }

  async refreshAuth(): Promise<void> {
    // Clari uses API key auth, so just re-authenticate
    await this.authenticate();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/v1/calls', {
        params: {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          limit: 1
        }
      });
      return response.status === 200;
    } catch (error) {
      console.error('Clari connection test failed:', error);
      return false;
    }
  }

  async listCalls(options: ListCallsOptions): Promise<CallMetadata[]> {
    const calls: CallMetadata[] = [];
    let offset = 0;
    const limit = Math.min(options.limit || 100, 100);
    
    try {
      do {
        const response = await this.apiClient.get<ClariListCallsResponse>('/v1/calls', {
          params: {
            startDate: options.startDate.toISOString(),
            endDate: options.endDate.toISOString(),
            limit,
            offset,
            status: 'completed'
          }
        });

        const mappedCalls = response.data.calls.map(call => this.mapClariCallToMetadata(call));
        calls.push(...mappedCalls);
        
        offset += limit;
        
        if (!response.data.hasMore || calls.length >= (options.limit || Infinity)) {
          break;
        }
        
        // Respect rate limit (10 req/s for Clari)
        await this.delay(100);
      } while (true);

      return calls.slice(0, options.limit);
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getTranscript(callId: string): Promise<Transcript> {
    try {
      const [callResponse, transcriptResponse] = await Promise.all([
        this.apiClient.get<{ call: ClariCall }>(`/v1/calls/${callId}`),
        this.apiClient.get<ClariTranscript>(`/v1/calls/${callId}/transcript`)
      ]);

      const call = callResponse.data.call;
      const clariTranscript = transcriptResponse.data;

      const segments: TranscriptSegment[] = clariTranscript.segments.map(segment => ({
        speaker: segment.speakerName || segment.speakerId,
        speakerEmail: segment.speakerEmail,
        text: segment.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: segment.confidence
      }));

      const fullText = segments.map(s => s.text).join(' ');

      return {
        callId,
        segments,
        fullText,
        metadata: this.mapClariCallToMetadata(call)
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getAIContent(callId: string): Promise<ClariAIInsights> {
    try {
      const response = await this.apiClient.get<ClariAIInsights>(`/v1/calls/${callId}/insights`);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async setupWebhook(webhookUrl: string): Promise<void> {
    try {
      await this.apiClient.post('/v1/webhooks', {
        url: webhookUrl,
        events: ['call.completed', 'call.transcribed'],
        active: true
      });
      console.log('Clari webhook configured successfully');
    } catch (error) {
      console.error('Failed to setup Clari webhook:', error);
      throw error;
    }
  }

  private mapClariCallToMetadata(call: ClariCall): CallMetadata {
    const attendees: Attendee[] = call.participants.map(p => ({
      email: p.email,
      name: p.name,
      role: p.role === 'host' ? 'host' : 'participant',
      company: p.company
    }));

    return {
      id: call.id,
      title: call.title,
      startTime: new Date(call.startTime),
      endTime: new Date(call.endTime),
      duration: call.duration,
      attendees,
      recordingUrl: call.recordingUrl,
      platform: 'clari'
    };
  }

  private handleApiError(error: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ClariErrorResponse>;
      if (axiosError.response?.status === 401) {
        throw new Error('Clari authentication failed. Check API key and org password.');
      } else if (axiosError.response?.status === 429) {
        throw new Error('Clari API rate limit exceeded (10 req/s). Please try again later.');
      } else if (axiosError.response?.data?.error) {
        throw new Error(`Clari API error: ${axiosError.response.data.error.message}`);
      }
    }
    throw error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}