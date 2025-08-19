import { GongClient } from './gongClient';
import axios from 'axios';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GongClient', () => {
  let gongClient: GongClient;
  let mockSecretsManager: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSecretsManager = mockClient(SecretsManagerClient);
    
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      defaults: { headers: { common: {} } }
    } as any);
    
    gongClient = new GongClient('test-secret', 'us-east-1');
  });

  describe('authenticate', () => {
    it('should authenticate with provided credentials', async () => {
      const mockAuthResponse = {
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      };

      const mockApiClient = mockedAxios.create.mock.results[0].value;
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      
      mockAuthClient.post.mockResolvedValue(mockAuthResponse);

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });

      expect(mockAuthClient.post).toHaveBeenCalledWith(
        '/oauth2/token',
        expect.stringContaining('grant_type=client_credentials')
      );
      expect(mockApiClient.defaults.headers.common['Authorization']).toBe('Bearer test-token');
    });

    it('should load credentials from secrets manager', async () => {
      const GetSecretValueCommand = require('@aws-sdk/client-secrets-manager').GetSecretValueCommand;
      mockSecretsManager.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({
          clientId: 'secret-client-id',
          clientSecret: 'secret-client-secret'
        })
      });

      const mockAuthResponse = {
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      };

      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      mockAuthClient.post.mockResolvedValue(mockAuthResponse);

      await gongClient.authenticate();

      expect(mockAuthClient.post).toHaveBeenCalled();
    });

    it('should throw error if credentials are missing', async () => {
      await expect(gongClient.authenticate({})).rejects.toThrow('Missing Gong client credentials');
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      
      mockAuthClient.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      });
      
      mockApiClient.get.mockResolvedValue({ status: 200, data: { calls: [] } });

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });

      const result = await gongClient.testConnection();
      
      expect(result).toBe(true);
      expect(mockApiClient.get).toHaveBeenCalledWith('/calls', expect.any(Object));
    });

    it('should return false when connection fails', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      
      mockAuthClient.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      });
      
      mockApiClient.get.mockRejectedValue(new Error('Connection failed'));

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });

      const result = await gongClient.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('listCalls', () => {
    beforeEach(async () => {
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      mockAuthClient.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      });

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });
    });

    it('should return mapped call metadata', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      
      const mockGongCalls = {
        data: {
          calls: [{
            id: 'call-123',
            title: 'Test Call',
            startTime: '2023-01-01T10:00:00Z',
            endTime: '2023-01-01T11:00:00Z',
            duration: 3600,
            participants: [{
              emailAddress: 'test@example.com',
              displayName: 'Test User',
              companyName: 'Test Company'
            }],
            recordingUrl: 'https://gong.io/call/123'
          }],
          totalRecords: 1,
          currentPageSize: 1,
          currentPageNumber: 1
        }
      };

      mockApiClient.get.mockResolvedValue(mockGongCalls);

      const calls = await gongClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02')
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        id: 'call-123',
        title: 'Test Call',
        platform: 'gong',
        attendees: expect.arrayContaining([
          expect.objectContaining({
            email: 'test@example.com',
            name: 'Test User'
          })
        ])
      });
    });

    it('should handle pagination', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      
      mockApiClient.get
        .mockResolvedValueOnce({
          data: {
            calls: [{ id: 'call-1', title: 'Call 1', participants: [] }],
            cursor: 'next-page'
          }
        })
        .mockResolvedValueOnce({
          data: {
            calls: [{ id: 'call-2', title: 'Call 2', participants: [] }],
            cursor: undefined
          }
        });

      const calls = await gongClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        limit: 200
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      expect(calls).toHaveLength(2);
    });
  });

  describe('getTranscript', () => {
    beforeEach(async () => {
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      mockAuthClient.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      });

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });
    });

    it('should return formatted transcript', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      
      const mockCall = {
        data: {
          call: {
            id: 'call-123',
            title: 'Test Call',
            startTime: '2023-01-01T10:00:00Z',
            endTime: '2023-01-01T11:00:00Z',
            duration: 3600,
            participants: [{
              emailAddress: 'speaker@example.com',
              displayName: 'Speaker Name',
              speakerId: 'speaker-1'
            }]
          }
        }
      };

      const mockTranscript = {
        data: {
          callId: 'call-123',
          transcript: [{
            speakerId: 'speaker-1',
            speakerName: 'Speaker Name',
            sentences: [{
              start: 0,
              end: 5000,
              text: 'Hello, this is a test.'
            }]
          }]
        }
      };

      mockApiClient.get
        .mockResolvedValueOnce(mockCall)
        .mockResolvedValueOnce(mockTranscript);

      const transcript = await gongClient.getTranscript('call-123');

      expect(transcript.callId).toBe('call-123');
      expect(transcript.segments).toHaveLength(1);
      expect(transcript.segments[0]).toMatchObject({
        speaker: 'Speaker Name',
        speakerEmail: 'speaker@example.com',
        text: 'Hello, this is a test.',
        startTime: 0,
        endTime: 5000
      });
      expect(transcript.fullText).toBe('Hello, this is a test.');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const mockAuthClient = mockedAxios.create.mock.results[1].value;
      mockAuthClient.post.mockResolvedValue({
        data: { access_token: 'test-token', expires_in: 3600 }
      });

      await gongClient.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      });
    });

    it('should handle 401 authentication errors', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      
      const error = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: { message: 'Unauthorized' } }
        }
      };
      
      mockApiClient.get.mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(gongClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Gong authentication failed');
    });

    it('should handle 429 rate limit errors', async () => {
      const mockApiClient = mockedAxios.create.mock.results[0].value;
      
      const error = {
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } }
        }
      };
      
      mockApiClient.get.mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(gongClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Gong API rate limit exceeded');
    });
  });
});