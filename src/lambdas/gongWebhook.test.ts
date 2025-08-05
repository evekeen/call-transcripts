import { handler } from './gongWebhook';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

jest.mock('@aws-sdk/client-sqs');

const mockSQSClient = {
  send: jest.fn()
};

(SQSClient as jest.MockedClass<typeof SQSClient>).mockImplementation(() => mockSQSClient as any);

describe('Gong Webhook Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      TRANSCRIPT_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/transcript-queue',
      AWS_REGION: 'us-east-1'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createMockEvent = (
    httpMethod: string = 'POST',
    body: any = null,
    headers: Record<string, string> = {}
  ): APIGatewayProxyEvent => ({
    httpMethod,
    body: body ? JSON.stringify(body) : null,
    headers,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as any,
    resource: '',
    path: '',
    isBase64Encoded: false,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null
  });

  it('should return 405 for non-POST requests', async () => {
    const event = createMockEvent('GET');
    const result = await handler(event);

    expect(result.statusCode).toBe(405);
    expect(JSON.parse(result.body)).toEqual({ error: 'Method not allowed' });
  });

  it('should return 400 for missing body', async () => {
    const event = createMockEvent('POST');
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing request body' });
  });

  it('should return 400 for invalid JSON', async () => {
    const event = createMockEvent('POST');
    event.body = 'invalid json';
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid JSON payload' });
  });

  it('should return 400 for missing required fields', async () => {
    const event = createMockEvent('POST', { eventType: 'CALL_PROCESSING_COMPLETED' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing required fields: eventType, callId' });
  });

  it('should ignore non-completion events', async () => {
    const event = createMockEvent('POST', {
      eventType: 'CALL_CREATED',
      callId: 'call-123'
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Event type ignored' });
    expect(mockSQSClient.send).not.toHaveBeenCalled();
  });

  it('should process valid webhook payload', async () => {
    const webhookPayload = {
      eventType: 'CALL_PROCESSING_COMPLETED',
      callId: 'call-123',
      timestamp: '2023-01-01T10:00:00Z',
      workspaceId: 'workspace-456',
      callData: {
        title: 'Test Call',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z'
      }
    };

    const event = createMockEvent('POST', webhookPayload);
    mockSQSClient.send.mockResolvedValue({});

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Webhook processed successfully',
      callId: 'call-123'
    });

    expect(mockSQSClient.send).toHaveBeenCalledWith(
      expect.any(SendMessageCommand)
    );

    const sentCommand = mockSQSClient.send.mock.calls[0][0] as SendMessageCommand;
    const messageBody = JSON.parse(sentCommand.input.MessageBody!);
    
    expect(messageBody).toMatchObject({
      platform: 'gong',
      callId: 'call-123',
      eventType: 'CALL_PROCESSING_COMPLETED',
      source: 'webhook'
    });
  });

  it('should verify webhook signature when secret is provided', async () => {
    process.env.GONG_WEBHOOK_SECRET = 'test-secret';
    
    const webhookPayload = {
      eventType: 'CALL_PROCESSING_COMPLETED',
      callId: 'call-123',
      timestamp: '2023-01-01T10:00:00Z'
    };

    const crypto = require('crypto');
    const body = JSON.stringify(webhookPayload);
    const signature = crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');

    const event = createMockEvent('POST', webhookPayload, {
      'x-gong-signature': `sha256=${signature}`
    });
    
    mockSQSClient.send.mockResolvedValue({});

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockSQSClient.send).toHaveBeenCalled();
  });

  it('should return 401 for invalid signature', async () => {
    process.env.GONG_WEBHOOK_SECRET = 'test-secret';
    
    const webhookPayload = {
      eventType: 'CALL_PROCESSING_COMPLETED',
      callId: 'call-123',
      timestamp: '2023-01-01T10:00:00Z'
    };

    const event = createMockEvent('POST', webhookPayload, {
      'x-gong-signature': 'sha256=invalid-signature'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid signature' });
    expect(mockSQSClient.send).not.toHaveBeenCalled();
  });

  it('should return 500 when SQS fails', async () => {
    const webhookPayload = {
      eventType: 'CALL_PROCESSING_COMPLETED',
      callId: 'call-123',
      timestamp: '2023-01-01T10:00:00Z'
    };

    const event = createMockEvent('POST', webhookPayload);
    mockSQSClient.send.mockRejectedValue(new Error('SQS error'));

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      error: 'Internal server error',
      details: 'SQS error'
    });
  });

  it('should return 500 when queue URL is missing', async () => {
    delete process.env.TRANSCRIPT_QUEUE_URL;

    const webhookPayload = {
      eventType: 'CALL_PROCESSING_COMPLETED',
      callId: 'call-123',
      timestamp: '2023-01-01T10:00:00Z'
    };

    const event = createMockEvent('POST', webhookPayload);

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      error: 'Internal server error',
      details: 'TRANSCRIPT_QUEUE_URL environment variable not set'
    });
  });
});