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
  GongAuthResponse,
  GongCall,
  GongListCallsResponse,
  GongTranscript,
  GongAIContent,
  GongErrorResponse
} from './types';

export class GongClient implements PlatformAdapter {
  name = 'gong';
  private apiClient: AxiosInstance;
  private authClient: AxiosInstance;
  private credentials: PlatformCredentials;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private secretsManager: SecretsManagerClient;
  private authMethod: 'basic' | 'oauth' | null = null;

  constructor(private secretName: string, region: string = 'us-east-1') {
    this.apiClient = axios.create({
      baseURL: 'https://api.gong.io/v2',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.authClient = axios.create({
      baseURL: 'https://app.gong.io',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
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

    // Debug loaded credentials
    console.log('Loaded credentials:', {
      hasClientId: !!this.credentials.clientId,
      hasClientSecret: !!this.credentials.clientSecret,
      hasApiKey: !!this.credentials.apiKey,
      clientIdValue: this.credentials.clientId,
      clientSecretLength: this.credentials.clientSecret?.length
    });

    // Support both OAuth (clientId + clientSecret) and Basic Auth (apiKey + apiSecret)
    if (this.credentials.apiKey && this.credentials.clientSecret && !this.credentials.clientId) {
      // Basic Auth with API Key and Secret
      console.log('Using Basic Auth authentication');
      this.authMethod = 'basic';
      this.setupBasicAuth();
    } else if (this.credentials.clientId && this.credentials.clientSecret && !this.credentials.apiKey) {
      // OAuth with Client Credentials
      console.log('Using OAuth authentication');
      this.authMethod = 'oauth';
      await this.getAccessToken();
    } else {
      throw new Error('Missing Gong credentials. Provide either: 1) GONG_API_KEY and GONG_API_SECRET for Basic Auth, or 2) GONG_CLIENT_ID and GONG_CLIENT_SECRET for OAuth');
    }
  }

  private async loadCredentialsFromSecrets(): Promise<void> {
    try {
      const command = new GetSecretValueCommand({ SecretId: this.secretName });
      const response = await this.secretsManager.send(command);
      
      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        
        // Prioritize Basic Auth if available
        if (secrets.apiKey && secrets.apiSecret) {
          this.credentials = {
            apiKey: secrets.apiKey,
            clientSecret: secrets.apiSecret
          };
        } else if (secrets.clientId && secrets.clientSecret) {
          this.credentials = {
            clientId: secrets.clientId,
            clientSecret: secrets.clientSecret
          };
        } else {
          this.credentials = {
            clientId: secrets.clientId,
            clientSecret: secrets.clientSecret,
            apiKey: secrets.apiKey
          };
        }
      } else {
        throw new Error('No secret string found');
      }
    } catch (error) {
      console.error('Failed to load credentials from Secrets Manager:', error);
      throw new Error('Failed to load Gong credentials');
    }
  }

  private loadCredentialsFromEnv(): void {
    // Load credentials based on what's available, prioritizing Basic Auth
    if (process.env.GONG_API_KEY && process.env.GONG_API_SECRET) {
      // Basic Auth credentials
      this.credentials = {
        apiKey: process.env.GONG_API_KEY,
        clientSecret: process.env.GONG_API_SECRET // Using clientSecret field for API secret
      };
    } else if (process.env.GONG_CLIENT_ID && process.env.GONG_CLIENT_SECRET) {
      // OAuth credentials
      this.credentials = {
        clientId: process.env.GONG_CLIENT_ID,
        clientSecret: process.env.GONG_CLIENT_SECRET
      };
    } else {
      // Partial credentials for error handling
      this.credentials = {
        clientId: process.env.GONG_CLIENT_ID,
        clientSecret: process.env.GONG_CLIENT_SECRET,
        apiKey: process.env.GONG_API_KEY
      };
    }
  }

  private setupBasicAuth(): void {
    if (!this.credentials.apiKey || !this.credentials.clientSecret) {
      throw new Error('Missing API key or secret for Basic Auth');
    }

    // Create Base64 encoded token: base64(apiKey:apiSecret)
    const token = Buffer.from(`${this.credentials.apiKey}:${this.credentials.clientSecret}`).toString('base64');
    this.apiClient.defaults.headers.common['Authorization'] = `Basic ${token}`;
    console.log('Gong Basic Auth configured successfully');
  }

  private async getAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientId!,
        client_secret: this.credentials.clientSecret!,
        scope: 'api:calls:read api:calls:transcript:read'
      });

      console.log('Attempting OAuth token request to Gong...');
      
      const response = await this.authClient.post<GongAuthResponse>(
        '/oauth2/token',
        params.toString()
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      console.log('Gong OAuth token obtained successfully');
    } catch (error) {
      console.error('Failed to obtain Gong access token:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        console.error('Response headers:', error.response.headers);
      }
      
      // Provide more specific error message
      if (error.response?.status === 401) {
        throw new Error('Gong OAuth authentication failed: Invalid client credentials or OAuth app not properly configured. Consider using Basic Auth instead.');
      } else {
        throw new Error(`Failed to authenticate with Gong: ${error.message}`);
      }
    }
  }

  async refreshAuth(): Promise<void> {
    this.accessToken = undefined;
    this.tokenExpiry = undefined;
    await this.getAccessToken();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      const response = await this.apiClient.get('/calls', {
        params: {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          limit: 1
        }
      });
      return response.status === 200;
    } catch (error) {
      console.error('Gong connection test failed:', error);
      return false;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.authMethod === 'oauth') {
      await this.getAccessToken();
    }
    // For Basic Auth, authentication is already set up in headers
  }

  async listCalls(options: ListCallsOptions): Promise<CallMetadata[]> {
    await this.ensureAuthenticated();
    
    const calls: CallMetadata[] = [];
    let cursor: string | undefined;
    const limit = options.limit || 100;
    
    try {
      do {
        const response = await this.apiClient.get<GongListCallsResponse>('/calls', {
          params: {
            startDate: options.startDate.toISOString(),
            endDate: options.endDate.toISOString(),
            cursor,
            limit: Math.min(limit - calls.length, 100)
          }
        });

        console.log('Gong API response:', {
          status: response.status,
          dataKeys: Object.keys(response.data),
          callsType: typeof response.data.calls,
          callsLength: Array.isArray(response.data.calls) ? response.data.calls.length : 'not array',
          firstCallKeys: response.data.calls?.[0] ? Object.keys(response.data.calls[0]) : 'no calls'
        });

        if (!response.data.calls || !Array.isArray(response.data.calls)) {
          console.log('Unexpected response structure:', response.data);
          break;
        }

        const mappedCalls = response.data.calls.map(call => this.mapGongCallToMetadata(call));
        calls.push(...mappedCalls);
        
        cursor = response.data.cursor;
        
        if (calls.length >= limit) {
          break;
        }
      } while (cursor);

      return calls;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getTranscript(callId: string): Promise<Transcript> {
    await this.ensureAuthenticated();

    try {
      const [callResponse, transcriptResponse] = await Promise.all([
        this.apiClient.get<{ call: GongCall }>(`/calls/${callId}`),
        this.apiClient.get<GongTranscript>(`/calls/${callId}/transcript`)
      ]);

      const call = callResponse.data.call;
      const gongTranscript = transcriptResponse.data;

      const segments: TranscriptSegment[] = [];
      let fullText = '';

      for (const segment of gongTranscript.transcript) {
        for (const sentence of segment.sentences) {
          const transcriptSegment: TranscriptSegment = {
            speaker: segment.speakerName || segment.speakerId,
            speakerEmail: this.findSpeakerEmail(segment.speakerId, call.participants),
            text: sentence.text,
            startTime: sentence.start,
            endTime: sentence.end
          };
          segments.push(transcriptSegment);
          fullText += sentence.text + ' ';
        }
      }

      return {
        callId,
        segments,
        fullText: fullText.trim(),
        metadata: this.mapGongCallToMetadata(call)
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async getAIContent(callId: string): Promise<GongAIContent> {
    await this.ensureAuthenticated();

    try {
      const response = await this.apiClient.get<GongAIContent>(`/calls/${callId}/ai-content`);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  async setupWebhook(webhookUrl: string): Promise<void> {
    console.log('Webhook setup must be done manually in Gong UI:', webhookUrl);
    console.log('Navigate to: Settings > API > Webhooks > Add Rule');
    console.log('Event: Call processing completed');
    console.log('Action: POST to', webhookUrl);
  }

  private mapGongCallToMetadata(call: GongCall): CallMetadata {
    const attendees: Attendee[] = call.participants.map(p => ({
      email: p.emailAddress,
      name: p.displayName,
      role: p.context?.active ? 'host' : 'participant',
      company: p.companyName
    }));

    return {
      id: call.id,
      title: call.title,
      startTime: new Date(call.startTime),
      endTime: new Date(call.endTime),
      duration: call.duration,
      attendees,
      recordingUrl: call.recordingUrl,
      platform: 'gong'
    };
  }

  private findSpeakerEmail(speakerId: string, participants: any[]): string | undefined {
    const participant = participants.find(p => p.speakerId === speakerId);
    return participant?.emailAddress;
  }

  private handleApiError(error: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<GongErrorResponse>;
      if (axiosError.response?.status === 401) {
        this.accessToken = undefined;
        this.tokenExpiry = undefined;
        throw new Error('Gong authentication failed. Token may have expired.');
      } else if (axiosError.response?.status === 429) {
        throw new Error('Gong API rate limit exceeded. Please try again later.');
      } else if (axiosError.response?.data?.error) {
        throw new Error(`Gong API error: ${axiosError.response.data.error.message}`);
      }
    }
    throw error;
  }
}