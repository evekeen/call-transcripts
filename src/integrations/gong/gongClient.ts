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
  GongTranscriptResponse,
  GongTranscriptRequest,
  GongExtensiveCallRequest,
  GongExtensiveCallResponse,
  GongAIContent,
  GongErrorResponse,
  GongParticipant
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
      throw new Error('Failed to load Gong credentials from AWS Secrets Manager');
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
    } catch (error: any) {
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


        if (!response.data.calls || !Array.isArray(response.data.calls)) {
          console.log('Unexpected Gong API response structure');
          break;
        }

        const mappedCalls = response.data.calls.map(call => this.mapGongCallToMetadata(call));
        calls.push(...mappedCalls);
        
        cursor = response.data.records.cursor;
        
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

  /**
   * Get participants for a call including speaker IDs, names, and emails
   */
  async getParticipants(callId: string): Promise<GongParticipant[]> {
    await this.ensureAuthenticated();

    try {
      const extensiveResponse = await this.apiClient.post<GongExtensiveCallResponse>('/calls/extensive', {
        "filter": {
          "callIds": [callId]
        },
        "contentSelector": {
          "exposedFields": {
            "parties": true
          }
        }
      });

      const callData = extensiveResponse.data.calls.find(call => call.metaData.id === callId);
      return callData?.parties || [];
    } catch (error: any) {
      if (error.response?.data?.errors) {
        console.warn(`Failed to get participants for call ${callId}:`, error.response.data.errors);
      } else {
        console.warn(`Failed to get participants for call ${callId}:`, error.message);
      }
      return []; // Return empty array if participants can't be fetched
    }
  }

  async getTranscript(callId: string): Promise<Transcript> {
    await this.ensureAuthenticated();

    try {
      const [callResponse, transcriptResponse, participants] = await Promise.all([
        this.apiClient.get<{ call: GongCall }>(`/calls/${callId}`),
        this.apiClient.post<GongTranscriptResponse>('/calls/transcript', {
          filter: {
            callIds: [callId]
          }
        } as GongTranscriptRequest),
        this.getParticipants(callId)
      ]);

      const call = callResponse.data.call;
      const transcriptData = transcriptResponse.data;

      // Find the transcript for our specific call ID
      const callTranscript = transcriptData.callTranscripts?.find(ct => ct.callId === callId);
      
      if (!callTranscript) {
        throw new Error(`No transcript found for call ID: ${callId}`);
      }

      // Create a map of speakerId to participant info for quick lookup
      const speakerMap = new Map<string, GongParticipant>();
      participants.forEach(participant => {
        speakerMap.set(participant.speakerId, participant);
      });

      const segments: TranscriptSegment[] = [];
      let fullText = '';

      for (const segment of callTranscript.transcript) {
        for (const sentence of segment.sentences) {
          const participant = speakerMap.get(segment.speakerId);
          const transcriptSegment: TranscriptSegment = {
            speaker: participant?.name || participant?.emailAddress || segment.speakerId, // Use name, fallback to email, then speakerId
            speakerEmail: participant?.emailAddress,
            text: sentence.text,
            startTime: sentence.start, // Time in milliseconds
            endTime: sentence.end     // Time in milliseconds
          };
          segments.push(transcriptSegment);
          fullText += sentence.text + ' ';
        }
      }

      return {
        callId,
        segments,
        fullText: fullText.trim(),
        metadata: this.mapGongCallToMetadata(call, participants)
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

  private mapGongCallToMetadata(call: GongCall, participants?: GongParticipant[]): CallMetadata {
    // Map participants to attendees if available
    const attendees: Attendee[] = participants?.map(participant => ({
      email: participant.emailAddress,
      name: participant.name || participant.displayName,
      role: participant.affiliation === 'Internal' ? 'host' : 'participant',
      company: participant.companyName
    })) || [];
    
    // Convert ISO timestamp strings to JavaScript Date objects
    const startTime = new Date(call.started);
    const endTime = new Date(startTime.getTime() + call.duration * 1000);

    return {
      id: call.id,
      title: call.title,
      startTime,
      endTime,
      duration: call.duration,
      attendees,
      recordingUrl: call.url,
      platform: 'gong'
    };
  }

  private findSpeakerEmail(speakerId: string, participants: GongParticipant[]): string | undefined {
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