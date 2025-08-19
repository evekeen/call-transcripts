import { SQSEvent } from 'aws-lambda';
import { PlatformFactory } from '../integrations/platformFactory';

const mockPlatformClient = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getTranscript: jest.fn(),
  getAIContent: jest.fn()
};

const mockSupabaseClient = {
  from: jest.fn()
};

// Mock the dependencies before importing the handler
jest.mock('../integrations/platformFactory');
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue(mockSupabaseClient)
}));

(PlatformFactory.createClient as jest.Mock).mockReturnValue(mockPlatformClient);

// Import handler after mocking dependencies
import { handler } from './transcriptProcessor';

describe('Transcript Processor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the mock implementation
    mockSupabaseClient.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn()
      })),
      delete: jest.fn(() => ({
        eq: jest.fn()
      }))
    }));
    
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

    // Mock the Supabase chain for account lookup (account doesn't exist)
    const accountSingleMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    // Mock the Supabase chain for account creation
    const accountCreateSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'account-123' }, 
      error: null 
    });
    const accountCreateSelectMock = jest.fn(() => ({ single: accountCreateSingleMock }));
    const accountCreateInsertMock = jest.fn(() => ({ select: accountCreateSelectMock }));

    // Mock the Supabase chain for transcript insertion
    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'transcript-123' }, 
      error: null 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    // Mock the Supabase chain for segment deletion
    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));

    // Mock the Supabase chain for segment insertion
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    // Set up the call sequence
    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })      // Account lookup
      .mockReturnValueOnce({ insert: accountCreateInsertMock }) // Account creation
      .mockReturnValueOnce({ insert: transcriptInsertMock })   // Transcript insertion
      .mockReturnValueOnce({ delete: segmentDeleteMock })      // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });     // Segment insertion

    await handler(event);

    expect(PlatformFactory.createClient).toHaveBeenCalledWith('gong', 'gong-api-credentials', 'us-east-1');
    expect(mockPlatformClient.authenticate).toHaveBeenCalled();
    expect(mockPlatformClient.getTranscript).toHaveBeenCalledWith('call-123');
    expect(mockPlatformClient.getAIContent).toHaveBeenCalledWith('call-123');
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
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

    // Mock existing account lookup
    const accountSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'existing-account-123' }, 
      error: null 
    });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    // Mock transcript insertion
    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'transcript-123' }, 
      error: null 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    // Mock segment operations
    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })    // Account lookup (exists)
      .mockReturnValueOnce({ insert: transcriptInsertMock }) // Transcript insertion
      .mockReturnValueOnce({ delete: segmentDeleteMock })    // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });   // Segment insertion

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
    const accountSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'account-123' }, 
      error: null 
    });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    // Mock duplicate key error on transcript insert
    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: null, 
      error: { code: '23505', message: 'Duplicate key' } 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    // Mock successful update
    const updateEqMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = jest.fn(() => ({ eq: updateEqMock }));

    // Mock segment operations
    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })    // Account lookup
      .mockReturnValueOnce({ insert: transcriptInsertMock }) // Transcript insert (fails)
      .mockReturnValueOnce({ update: updateMock })           // Transcript update (succeeds)
      .mockReturnValueOnce({ delete: segmentDeleteMock })    // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });   // Segment insertion

    await handler(event);

    expect(updateMock).toHaveBeenCalled();
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

    // Mock existing account
    const accountSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'account-123' }, 
      error: null 
    });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    // Mock transcript insertion
    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'transcript-123' }, 
      error: null 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    // Mock segment operations
    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })    // Account lookup
      .mockReturnValueOnce({ insert: transcriptInsertMock }) // Transcript insertion
      .mockReturnValueOnce({ delete: segmentDeleteMock })    // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });   // Segment insertion

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

    // Second message fails at getTranscript
    mockPlatformClient.authenticate.mockResolvedValueOnce(undefined);
    mockPlatformClient.getTranscript.mockRejectedValueOnce(new Error('Transcript not found'));

    // Mock Supabase for first message (successful)
    const accountSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'account-123' }, 
      error: null 
    });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'transcript-123' }, 
      error: null 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })    // Account lookup
      .mockReturnValueOnce({ insert: transcriptInsertMock }) // Transcript insertion
      .mockReturnValueOnce({ delete: segmentDeleteMock })    // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });   // Segment insertion

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

    // Mock account lookup for company.com (doesn't exist)
    const accountSingleMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const accountEqMock = jest.fn(() => ({ single: accountSingleMock }));
    const accountSelectMock = jest.fn(() => ({ eq: accountEqMock }));

    // Mock account creation
    const accountCreateSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'company-account' }, 
      error: null 
    });
    const accountCreateSelectMock = jest.fn(() => ({ single: accountCreateSingleMock }));
    const accountCreateInsertMock = jest.fn(() => ({ select: accountCreateSelectMock }));

    // Mock transcript insertion
    const transcriptSingleMock = jest.fn().mockResolvedValue({ 
      data: { id: 'transcript-123' }, 
      error: null 
    });
    const transcriptSelectMock = jest.fn(() => ({ single: transcriptSingleMock }));
    const transcriptInsertMock = jest.fn(() => ({ select: transcriptSelectMock }));

    // Mock segment operations
    const segmentDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
    const segmentDeleteMock = jest.fn(() => ({ eq: segmentDeleteEqMock }));
    const segmentInsertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseClient.from
      .mockReturnValueOnce({ select: accountSelectMock })      // Account lookup
      .mockReturnValueOnce({ insert: accountCreateInsertMock }) // Account creation
      .mockReturnValueOnce({ insert: transcriptInsertMock })   // Transcript insertion
      .mockReturnValueOnce({ delete: segmentDeleteMock })      // Segment deletion
      .mockReturnValueOnce({ insert: segmentInsertMock });     // Segment insertion

    await handler(event);

    // Should create account for company.com, not gmail.com
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('accounts');
  });
});