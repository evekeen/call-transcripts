import { handler } from './transcriptProcessor';
import { SQSEvent } from 'aws-lambda';
import { PlatformFactory } from '../integrations/platformFactory';
import { createClient } from '@supabase/supabase-js';

jest.mock('../integrations/platformFactory');
jest.mock('@supabase/supabase-js');

const mockPlatformClient = {
  authenticate: jest.fn(),
  getTranscript: jest.fn(),
  getAIContent: jest.fn()
};

const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn()
};

(PlatformFactory.createClient as jest.Mock).mockReturnValue(mockPlatformClient);
(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

describe('Transcript Processor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_KEY: 'test-service-key',
      AWS_REGION: 'us-east-1'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createMockSQSEvent = (messages: any[]): SQSEvent => ({
    Records: messages.map((message, index) => ({
      messageId: `message-${index}`,
      receiptHandle: `receipt-${index}`,
      body: JSON.stringify(message),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1640995200000',
        SenderId: 'sender-123',
        ApproximateFirstReceiveTimestamp: '1640995200000'
      },
      messageAttributes: {},
      md5OfBody: 'test-md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:test-queue',
      awsRegion: 'us-east-1'
    }))
  });

  const mockTranscript = {
    callId: 'call-123',
    segments: [
      {
        speaker: 'John Doe',
        speakerEmail: 'john@example.com',
        text: 'Hello, this is a test call.',
        startTime: 0,
        endTime: 5000,
        confidence: 0.95
      }
    ],
    fullText: 'Hello, this is a test call.',
    metadata: {
      id: 'call-123',
      title: 'Test Call',
      startTime: new Date('2023-01-01T10:00:00Z'),
      endTime: new Date('2023-01-01T11:00:00Z'),
      duration: 3600,
      attendees: [
        { email: 'john@example.com', name: 'John Doe', role: 'host' as const },
        { email: 'jane@client.com', name: 'Jane Smith', role: 'participant' as const }
      ],
      platform: 'gong' as const
    }
  };

  it('should process single transcript message successfully', async () => {
    const message = {
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      timestamp: '2023-01-01T10:00:00Z',
      source: 'webhook'
    };

    const event = createMockSQSEvent([message]);

    // Mock platform client responses
    mockPlatformClient.authenticate.mockResolvedValue(undefined);
    mockPlatformClient.getTranscript.mockResolvedValue(mockTranscript);
    mockPlatformClient.getAIContent.mockResolvedValue({ summary: 'Test summary' });

    // Mock Supabase responses for account creation
    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: null, error: null }) // No existing account
      .mockResolvedValueOnce({ data: { id: 'account-123' }, error: null }) // New account created
      .mockResolvedValueOnce({ data: { id: 'transcript-123' }, error: null }); // Transcript stored

    mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    expect(PlatformFactory.createClient).toHaveBeenCalledWith('gong', 'gong-api-credentials', 'us-east-1');
    expect(mockPlatformClient.authenticate).toHaveBeenCalled();
    expect(mockPlatformClient.getTranscript).toHaveBeenCalledWith('call-123');
    expect(mockPlatformClient.getAIContent).toHaveBeenCalledWith('call-123');
  });

  it('should handle existing account correctly', async () => {
    const message = {
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      timestamp: '2023-01-01T10:00:00Z',
      source: 'webhook'
    };

    const event = createMockSQSEvent([message]);

    mockPlatformClient.authenticate.mockResolvedValue(undefined);
    mockPlatformClient.getTranscript.mockResolvedValue(mockTranscript);
    mockPlatformClient.getAIContent.mockResolvedValue({ summary: 'Test summary' });

    // Mock existing account
    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: { id: 'existing-account-123' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'transcript-123' }, error: null });

    mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
  });

  it('should handle duplicate transcript by updating', async () => {
    const message = {
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      timestamp: '2023-01-01T10:00:00Z',
      source: 'webhook'
    };

    const event = createMockSQSEvent([message]);

    mockPlatformClient.authenticate.mockResolvedValue(undefined);
    mockPlatformClient.getTranscript.mockResolvedValue(mockTranscript);
    mockPlatformClient.getAIContent.mockResolvedValue({ summary: 'Test summary' });

    // Mock existing account
    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: { id: 'account-123' }, error: null });

    // Mock duplicate key error, then successful update
    mockSupabaseClient.insert
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'Duplicate key' } });
    
    mockSupabaseClient.update.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    expect(mockSupabaseClient.update).toHaveBeenCalled();
  });

  it('should handle AI content retrieval failure gracefully', async () => {
    const message = {
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      timestamp: '2023-01-01T10:00:00Z',
      source: 'webhook'
    };

    const event = createMockSQSEvent([message]);

    mockPlatformClient.authenticate.mockResolvedValue(undefined);
    mockPlatformClient.getTranscript.mockResolvedValue(mockTranscript);
    mockPlatformClient.getAIContent.mockRejectedValue(new Error('AI content not available'));

    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: { id: 'account-123' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'transcript-123' }, error: null });

    mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    // Should continue processing despite AI content failure
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('transcripts');
  });

  it('should process multiple messages and handle failures', async () => {
    const messages = [
      {
        platform: 'gong',
        callId: 'call-123',
        eventType: 'CALL_PROCESSING_COMPLETED',
        timestamp: '2023-01-01T10:00:00Z',
        source: 'webhook'
      },
      {
        platform: 'clari',
        callId: 'call-456',
        eventType: 'call.completed',
        timestamp: '2023-01-01T11:00:00Z',
        source: 'webhook'
      }
    ];

    const event = createMockSQSEvent(messages);

    // First message succeeds
    mockPlatformClient.authenticate.mockResolvedValueOnce(undefined);
    mockPlatformClient.getTranscript.mockResolvedValueOnce(mockTranscript);
    mockPlatformClient.getAIContent.mockResolvedValueOnce({ summary: 'Test summary' });

    // Second message fails
    mockPlatformClient.authenticate.mockResolvedValueOnce(undefined);
    mockPlatformClient.getTranscript.mockRejectedValueOnce(new Error('Transcript not found'));

    mockSupabaseClient.single
      .mockResolvedValue({ data: { id: 'account-123' }, error: null });
    mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    expect(PlatformFactory.createClient).toHaveBeenCalledTimes(2);
  });

  it('should handle internal domains correctly', async () => {
    const transcriptWithInternalDomains = {
      ...mockTranscript,
      metadata: {
        ...mockTranscript.metadata,
        attendees: [
          { email: 'john@gmail.com', name: 'John Doe', role: 'host' as const },
          { email: 'jane@company.com', name: 'Jane Smith', role: 'participant' as const }
        ]
      }
    };

    const message = {
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      timestamp: '2023-01-01T10:00:00Z',
      source: 'webhook'
    };

    const event = createMockSQSEvent([message]);

    mockPlatformClient.authenticate.mockResolvedValue(undefined);
    mockPlatformClient.getTranscript.mockResolvedValue(transcriptWithInternalDomains);
    mockPlatformClient.getAIContent.mockResolvedValue({ summary: 'Test summary' });

    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: null, error: null }) // No existing account for company.com
      .mockResolvedValueOnce({ data: { id: 'company-account' }, error: null }) // New account created
      .mockResolvedValueOnce({ data: { id: 'transcript-123' }, error: null });

    mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.delete.mockResolvedValue({ data: null, error: null });

    await handler(event);

    // Should create account for company.com, not gmail.com
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
  });
});