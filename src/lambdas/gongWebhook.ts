import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { GongWebhookPayload } from '../integrations/gong/types';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Gong webhook received:', JSON.stringify(event, null, 2));

  try {
    // Validate request method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse webhook payload
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing request body' })
      };
    }

    let webhookPayload: GongWebhookPayload;
    try {
      webhookPayload = JSON.parse(event.body);
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    // Validate required fields
    if (!webhookPayload.eventType || !webhookPayload.callId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing required fields: eventType, callId' })
      };
    }

    // Only process completed calls
    if (webhookPayload.eventType !== 'CALL_PROCESSING_COMPLETED') {
      console.log(`Ignoring event type: ${webhookPayload.eventType}`);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Event type ignored' })
      };
    }

    // Verify webhook signature if provided
    const webhookSecret = process.env.GONG_WEBHOOK_SECRET;
    if (webhookSecret && event.headers['x-gong-signature']) {
      const crypto = await import('crypto');
      const signature = event.headers['x-gong-signature'];
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(event.body)
        .digest('hex');
      
      const signatureBuffer = Buffer.from(signature.replace('sha256=', ''), 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      if (signatureBuffer.length !== expectedBuffer.length || 
          !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.error('Webhook signature verification failed');
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Invalid signature' })
        };
      }
    }

    // Send message to SQS for processing
    const queueUrl = process.env.TRANSCRIPT_QUEUE_URL;
    if (!queueUrl) {
      throw new Error('TRANSCRIPT_QUEUE_URL environment variable not set');
    }

    const message = {
      platform: 'gong',
      callId: webhookPayload.callId,
      eventType: webhookPayload.eventType,
      timestamp: webhookPayload.timestamp,
      workspaceId: webhookPayload.workspaceId,
      callData: webhookPayload.callData,
      source: 'webhook'
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: 'gong-transcripts', // For FIFO queues
      MessageDeduplicationId: `gong-${webhookPayload.callId}-${Date.now()}`,
      MessageAttributes: {
        platform: {
          DataType: 'String',
          StringValue: 'gong'
        },
        eventType: {
          DataType: 'String',
          StringValue: webhookPayload.eventType
        },
        callId: {
          DataType: 'String',
          StringValue: webhookPayload.callId
        }
      }
    });

    await sqsClient.send(command);

    console.log(`Successfully queued transcript processing for call: ${webhookPayload.callId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        message: 'Webhook processed successfully',
        callId: webhookPayload.callId 
      })
    };

  } catch (error) {
    console.error('Error processing Gong webhook:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};