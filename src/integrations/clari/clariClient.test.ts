import { ClariClient } from './clariClient';
import axios from 'axios';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ClariClient', () => {
  let clariClient: ClariClient;
  let mockSecretsManager: any;
  let mockApiClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSecretsManager = mockClient(SecretsManagerClient);
    
    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: { headers: { common: {} } }
    };
    
    mockedAxios.create.mockReturnValue(mockApiClient);
    
    clariClient = new ClariClient('test-secret', 'us-east-1');
  });

  describe('authenticate', () => {
    it('should authenticate with API key', async () => {
      await clariClient.authenticate({
        apiKey: 'test-api-key',
        clientSecret: 'test-org-password'
      });

      expect(mockApiClient.defaults.headers.common['Authorization']).toBe('Bearer test-api-key');
      expect(mockApiClient.defaults.headers.common['X-Org-Password']).toBe('test-org-password');
    });

    it('should load credentials from secrets manager', async () => {
      const GetSecretValueCommand = require('@aws-sdk/client-secrets-manager').GetSecretValueCommand;
      mockSecretsManager.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({
          apiKey: 'secret-api-key',
          orgPassword: 'secret-org-password'
        })
      });

      await clariClient.authenticate();

      expect(mockApiClient.defaults.headers.common['Authorization']).toBe('Bearer secret-api-key');
      expect(mockApiClient.defaults.headers.common['X-Org-Password']).toBe('secret-org-password');
    });

    it('should throw error if API key is missing', async () => {
      await expect(clariClient.authenticate({})).rejects.toThrow('Missing Clari API key');
    });

    it('should work without org password', async () => {
      await clariClient.authenticate({
        apiKey: 'test-api-key'
      });

      expect(mockApiClient.defaults.headers.common['Authorization']).toBe('Bearer test-api-key');
      expect(mockApiClient.defaults.headers.common['X-Org-Password']).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await clariClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return true when connection is successful', async () => {
      mockApiClient.get.mockResolvedValue({ status: 200, data: { calls: [] } });

      const result = await clariClient.testConnection();
      
      expect(result).toBe(true);
      expect(mockApiClient.get).toHaveBeenCalledWith('/v1/calls', expect.any(Object));
    });

    it('should return false when connection fails', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Connection failed'));

      const result = await clariClient.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('listCalls', () => {
    beforeEach(async () => {
      await clariClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return mapped call metadata', async () => {
      const mockClariCalls = {
        data: {
          calls: [{
            id: 'call-123',
            title: 'Test Clari Call',
            startTime: '2023-01-01T10:00:00Z',
            endTime: '2023-01-01T11:00:00Z',
            duration: 3600,
            participants: [{
              email: 'test@example.com',
              name: 'Test User',
              role: 'host',
              company: 'Test Company'
            }],
            recordingUrl: 'https://clari.com/recording/123'
          }],
          total: 1,
          limit: 100,
          offset: 0,
          hasMore: false
        }
      };

      mockApiClient.get.mockResolvedValue(mockClariCalls);

      const calls = await clariClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02')
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        id: 'call-123',
        title: 'Test Clari Call',
        platform: 'clari',
        attendees: expect.arrayContaining([
          expect.objectContaining({
            email: 'test@example.com',
            name: 'Test User',
            role: 'host'
          })
        ])
      });
    });

    it('should handle pagination with rate limiting', async () => {
      jest.spyOn(clariClient as any, 'delay').mockResolvedValue(undefined);

      mockApiClient.get
        .mockResolvedValueOnce({
          data: {
            calls: [{ id: 'call-1', title: 'Call 1', participants: [] }],
            hasMore: true,
            limit: 100,
            offset: 0
          }
        })
        .mockResolvedValueOnce({
          data: {
            calls: [{ id: 'call-2', title: 'Call 2', participants: [] }],
            hasMore: false,
            limit: 100,
            offset: 100
          }
        });

      const calls = await clariClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        limit: 200
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      expect(calls).toHaveLength(2);
      expect((clariClient as any).delay).toHaveBeenCalledWith(100);
    });
  });

  describe('getTranscript', () => {
    beforeEach(async () => {
      await clariClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return formatted transcript', async () => {
      const mockCall = {
        data: {
          call: {
            id: 'call-123',
            title: 'Test Call',
            startTime: '2023-01-01T10:00:00Z',
            endTime: '2023-01-01T11:00:00Z',
            duration: 3600,
            participants: [{
              email: 'speaker@example.com',
              name: 'Speaker Name',
              role: 'host'
            }]
          }
        }
      };

      const mockTranscript = {
        data: {
          callId: 'call-123',
          segments: [{
            speakerId: 'speaker-1',
            speakerName: 'Speaker Name',
            speakerEmail: 'speaker@example.com',
            text: 'Hello from Clari.',
            startTime: 0,
            endTime: 5000,
            confidence: 0.95
          }],
          duration: 3600
        }
      };

      mockApiClient.get
        .mockResolvedValueOnce(mockCall)
        .mockResolvedValueOnce(mockTranscript);

      const transcript = await clariClient.getTranscript('call-123');

      expect(transcript.callId).toBe('call-123');
      expect(transcript.segments).toHaveLength(1);
      expect(transcript.segments[0]).toMatchObject({
        speaker: 'Speaker Name',
        speakerEmail: 'speaker@example.com',
        text: 'Hello from Clari.',
        startTime: 0,
        endTime: 5000,
        confidence: 0.95
      });
      expect(transcript.fullText).toBe('Hello from Clari.');
    });
  });

  describe('setupWebhook', () => {
    beforeEach(async () => {
      await clariClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should configure webhook successfully', async () => {
      mockApiClient.post.mockResolvedValue({ status: 200, data: { id: 'webhook-123' } });

      await clariClient.setupWebhook('https://example.com/webhook');

      expect(mockApiClient.post).toHaveBeenCalledWith('/v1/webhooks', {
        url: 'https://example.com/webhook',
        events: ['call.completed', 'call.transcribed'],
        active: true
      });
    });

    it('should handle webhook setup failure', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Webhook setup failed'));

      await expect(clariClient.setupWebhook('https://example.com/webhook'))
        .rejects.toThrow('Webhook setup failed');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await clariClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should handle 401 authentication errors', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: { message: 'Unauthorized' } }
        }
      };
      
      mockApiClient.get.mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(clariClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Clari authentication failed');
    });

    it('should handle 429 rate limit errors', async () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } }
        }
      };
      
      mockApiClient.get.mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(clariClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Clari API rate limit exceeded');
    });
  });
});