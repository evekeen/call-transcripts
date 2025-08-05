import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ClariWebhookPayload } from '../integrations/clari/types';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Clari webhook received:', JSON.stringify(event, null, 2));

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing request body' })
      };
    }

    let webhookPayload: ClariWebhookPayload;
    try {
      webhookPayload = JSON.parse(event.body);
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    if (!webhookPayload.event || !webhookPayload.callId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: event, callId' })
      };
    }

    // Only process completed and transcribed calls
    if (!['call.completed', 'call.transcribed'].includes(webhookPayload.event)) {
      console.log(`Ignoring event type: ${webhookPayload.event}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Event type ignored' })
      };
    }

    const queueUrl = process.env.TRANSCRIPT_QUEUE_URL;
    if (!queueUrl) {
      throw new Error('TRANSCRIPT_QUEUE_URL environment variable not set');
    }

    const message = {
      platform: 'clari',
      callId: webhookPayload.callId,
      eventType: webhookPayload.event,
      timestamp: webhookPayload.timestamp,
      callData: webhookPayload.data,
      source: 'webhook'
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: 'clari-transcripts',
      MessageDeduplicationId: `clari-${webhookPayload.callId}-${Date.now()}`,
      MessageAttributes: {
        platform: { DataType: 'String', StringValue: 'clari' },
        eventType: { DataType: 'String', StringValue: webhookPayload.event },
        callId: { DataType: 'String', StringValue: webhookPayload.callId }
      }
    });

    await sqsClient.send(command);

    console.log(`Successfully queued Clari transcript processing for call: ${webhookPayload.callId}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Webhook processed successfully',
        callId: webhookPayload.callId 
      })
    };

  } catch (error) {
    console.error('Error processing Clari webhook:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};