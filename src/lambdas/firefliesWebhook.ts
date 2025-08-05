import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { FirefliesWebhookPayload } from '../integrations/fireflies/types';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Fireflies webhook received:', JSON.stringify(event, null, 2));

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

    let webhookPayload: FirefliesWebhookPayload;
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

    if (!webhookPayload.event || !webhookPayload.transcriptId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: event, transcriptId' })
      };
    }

    // Only process transcription complete events
    if (webhookPayload.event !== 'transcription_complete') {
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
      platform: 'fireflies',
      callId: webhookPayload.transcriptId,
      eventType: webhookPayload.event,
      timestamp: webhookPayload.timestamp,
      participants: webhookPayload.participants,
      title: webhookPayload.title,
      source: 'webhook'
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: 'fireflies-transcripts',
      MessageDeduplicationId: `fireflies-${webhookPayload.transcriptId}-${Date.now()}`,
      MessageAttributes: {
        platform: { DataType: 'String', StringValue: 'fireflies' },
        eventType: { DataType: 'String', StringValue: webhookPayload.event },
        callId: { DataType: 'String', StringValue: webhookPayload.transcriptId }
      }
    });

    await sqsClient.send(command);

    console.log(`Successfully queued Fireflies transcript processing for transcript: ${webhookPayload.transcriptId}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Webhook processed successfully',
        transcriptId: webhookPayload.transcriptId 
      })
    };

  } catch (error) {
    console.error('Error processing Fireflies webhook:', error);
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