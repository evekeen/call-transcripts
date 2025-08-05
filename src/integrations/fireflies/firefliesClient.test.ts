import { FirefliesClient } from './firefliesClient';
import { GraphQLClient } from 'graphql-request';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';

jest.mock('graphql-request');
const MockedGraphQLClient = GraphQLClient as jest.MockedClass<typeof GraphQLClient>;

describe('FirefliesClient', () => {
  let firefliesClient: FirefliesClient;
  let mockSecretsManager: any;
  let mockGraphQLClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSecretsManager = mockClient(SecretsManagerClient);
    
    mockGraphQLClient = {
      request: jest.fn(),
      setHeader: jest.fn(),
    };
    
    MockedGraphQLClient.mockImplementation(() => mockGraphQLClient);
    
    firefliesClient = new FirefliesClient('test-secret', 'us-east-1');
  });

  describe('authenticate', () => {
    it('should authenticate with API key', async () => {
      await firefliesClient.authenticate({
        apiKey: 'test-api-key'
      });

      expect(mockGraphQLClient.setHeader).toHaveBeenCalledWith(
        'Authorization',
        'Bearer test-api-key'
      );
    });

    it('should load credentials from secrets manager', async () => {
      const GetSecretValueCommand = require('@aws-sdk/client-secrets-manager').GetSecretValueCommand;
      mockSecretsManager.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({
          apiKey: 'secret-api-key'
        })
      });

      await firefliesClient.authenticate();

      expect(mockGraphQLClient.setHeader).toHaveBeenCalledWith(
        'Authorization',
        'Bearer secret-api-key'
      );
    });

    it('should throw error if API key is missing', async () => {
      await expect(firefliesClient.authenticate({})).rejects.toThrow('Missing Fireflies API key');
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return true when connection is successful', async () => {
      mockGraphQLClient.request.mockResolvedValue({
        user: { id: '123', email: 'test@example.com' }
      });

      const result = await firefliesClient.testConnection();
      
      expect(result).toBe(true);
      expect(mockGraphQLClient.request).toHaveBeenCalledWith(
        expect.stringContaining('query TestConnection')
      );
    });

    it('should return false when connection fails', async () => {
      mockGraphQLClient.request.mockRejectedValue(new Error('Connection failed'));

      const result = await firefliesClient.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('listCalls', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
      jest.spyOn(firefliesClient as any, 'delay').mockResolvedValue(undefined);
    });

    it('should return mapped call metadata', async () => {
      const mockResponse = {
        transcripts: {
          edges: [{
            node: {
              id: 'ff-123',
              title: 'Test Fireflies Meeting',
              date: '2023-01-01T10:00:00Z',
              duration: 3600,
              meeting_attendees: [{
                displayName: 'Test User',
                email: 'test@example.com',
                name: 'Test User'
              }],
              audio_url: 'https://fireflies.ai/audio/123'
            },
            cursor: 'cursor-1'
          }],
          pageInfo: {
            hasNextPage: false,
            endCursor: 'cursor-1'
          },
          totalCount: 1
        }
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const calls = await firefliesClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02')
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        id: 'ff-123',
        title: 'Test Fireflies Meeting',
        platform: 'fireflies',
        duration: 3600,
        attendees: expect.arrayContaining([
          expect.objectContaining({
            email: 'test@example.com',
            name: 'Test User'
          })
        ])
      });
    });

    it('should handle pagination', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          transcripts: {
            edges: [{
              node: { id: 'ff-1', title: 'Meeting 1', date: '2023-01-01T10:00:00Z', duration: 1800, meeting_attendees: [] },
              cursor: 'cursor-1'
            }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            totalCount: 2
          }
        })
        .mockResolvedValueOnce({
          transcripts: {
            edges: [{
              node: { id: 'ff-2', title: 'Meeting 2', date: '2023-01-01T11:00:00Z', duration: 1800, meeting_attendees: [] },
              cursor: 'cursor-2'
            }],
            pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
            totalCount: 2
          }
        });

      const calls = await firefliesClient.listCalls({
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        limit: 100
      });

      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(2);
      expect(calls).toHaveLength(2);
      expect((firefliesClient as any).delay).toHaveBeenCalledWith(1200);
    });
  });

  describe('getTranscript', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return formatted transcript', async () => {
      const mockResponse = {
        transcript: {
          id: 'ff-123',
          title: 'Test Meeting',
          date: '2023-01-01T10:00:00Z',
          duration: 3600,
          meeting_attendees: [{
            displayName: 'Speaker One',
            email: 'speaker1@example.com'
          }],
          sentences: [{
            index: 0,
            speaker_name: 'Speaker One',
            speaker_email: 'speaker1@example.com',
            text: 'Hello from Fireflies.',
            start_time: 0,
            end_time: 5
          }],
          summary: {
            overview: 'Test meeting summary',
            action_items: ['Follow up on project']
          }
        }
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const transcript = await firefliesClient.getTranscript('ff-123');

      expect(transcript.callId).toBe('ff-123');
      expect(transcript.segments).toHaveLength(1);
      expect(transcript.segments[0]).toMatchObject({
        speaker: 'Speaker One',
        speakerEmail: 'speaker1@example.com',
        text: 'Hello from Fireflies.',
        startTime: 0,
        endTime: 5000
      });
      expect(transcript.fullText).toBe('Hello from Fireflies.');
    });

    it('should throw error if transcript not found', async () => {
      mockGraphQLClient.request.mockResolvedValue({ transcript: null });

      await expect(firefliesClient.getTranscript('invalid-id'))
        .rejects.toThrow('Transcript not found for call ID: invalid-id');
    });
  });

  describe('getAIContent', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should return AI summary content', async () => {
      const mockSummary = {
        overview: 'Meeting about Q1 goals',
        action_items: ['Review budget', 'Schedule follow-up'],
        questions: [{
          question: 'What is the timeline?',
          answer: 'End of Q1',
          timestamp: 300
        }]
      };

      mockGraphQLClient.request.mockResolvedValue({
        transcript: { summary: mockSummary }
      });

      const aiContent = await firefliesClient.getAIContent('ff-123');

      expect(aiContent).toEqual(mockSummary);
    });

    it('should return null if no summary available', async () => {
      mockGraphQLClient.request.mockResolvedValue({
        transcript: { summary: null }
      });

      const aiContent = await firefliesClient.getAIContent('ff-123');

      expect(aiContent).toBeNull();
    });
  });

  describe('setupWebhook', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should configure webhook successfully', async () => {
      mockGraphQLClient.request.mockResolvedValue({
        createWebhook: {
          id: 'webhook-123',
          url: 'https://example.com/webhook',
          events: ['transcription_complete'],
          active: true
        }
      });

      await firefliesClient.setupWebhook('https://example.com/webhook');

      expect(mockGraphQLClient.request).toHaveBeenCalledWith(
        expect.stringContaining('mutation CreateWebhook'),
        {
          url: 'https://example.com/webhook',
          events: ['transcription_complete']
        }
      );
    });

    it('should handle webhook setup failure', async () => {
      mockGraphQLClient.request.mockRejectedValue(new Error('Webhook setup failed'));

      await expect(firefliesClient.setupWebhook('https://example.com/webhook'))
        .rejects.toThrow('Webhook setup failed');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await firefliesClient.authenticate({ apiKey: 'test-api-key' });
    });

    it('should handle authentication errors', async () => {
      const error = {
        response: {
          errors: [{
            message: 'Unauthorized: Invalid API key'
          }]
        }
      };
      
      mockGraphQLClient.request.mockRejectedValue(error);

      await expect(firefliesClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Fireflies authentication failed');
    });

    it('should handle rate limit errors', async () => {
      const error = {
        response: {
          errors: [{
            message: 'API rate limit exceeded'
          }]
        }
      };
      
      mockGraphQLClient.request.mockRejectedValue(error);

      await expect(firefliesClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Fireflies API rate limit exceeded');
    });

    it('should handle generic API errors', async () => {
      const error = {
        response: {
          errors: [{
            message: 'Field not found',
            code: 'FIELD_ERROR'
          }]
        }
      };
      
      mockGraphQLClient.request.mockRejectedValue(error);

      await expect(firefliesClient.listCalls({
        startDate: new Date(),
        endDate: new Date()
      })).rejects.toThrow('Fireflies API error: Field not found');
    });
  });
});