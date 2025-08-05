import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class GongIntegrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gongApiSecret = new secretsmanager.Secret(this, 'GongApiCredentials', {
      description: 'Gong API credentials for transcript retrieval',
      secretObjectValue: {
        clientId: cdk.SecretValue.unsafePlainText('PLACEHOLDER_CLIENT_ID'),
        clientSecret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_CLIENT_SECRET'),
        apiKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER_API_KEY')
      }
    });

    const transcriptQueue = new sqs.Queue(this, 'GongTranscriptQueue', {
      queueName: 'gong-transcript-processing-queue',
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'GongTranscriptDLQ', {
          queueName: 'gong-transcript-dlq',
          retentionPeriod: cdk.Duration.days(14)
        })
      }
    });

    const gongWebhookLogGroup = new logs.LogGroup(this, 'GongWebhookLogGroup', {
      logGroupName: '/aws/lambda/gong-webhook-handler',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const transcriptProcessorLogGroup = new logs.LogGroup(this, 'TranscriptProcessorLogGroup', {
      logGroupName: '/aws/lambda/gong-transcript-processor',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const gongWebhookHandler = new NodejsFunction(this, 'GongWebhookHandler', {
      functionName: 'gong-webhook-handler',
      entry: path.join(__dirname, '../../src/lambdas/gongWebhook.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TRANSCRIPT_QUEUE_URL: transcriptQueue.queueUrl,
        SECRET_NAME: gongApiSecret.secretName
      },
      logGroup: gongWebhookLogGroup
    });

    const transcriptProcessor = new NodejsFunction(this, 'GongTranscriptProcessor', {
      functionName: 'gong-transcript-processor',
      entry: path.join(__dirname, '../../src/lambdas/transcriptProcessor.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        SECRET_NAME: gongApiSecret.secretName,
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
      },
      logGroup: transcriptProcessorLogGroup
    });

    transcriptProcessor.addEventSource(new cdk.aws_lambda_event_sources.SqsEventSource(transcriptQueue, {
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(20)
    }));

    gongApiSecret.grantRead(gongWebhookHandler);
    gongApiSecret.grantRead(transcriptProcessor);
    transcriptQueue.grantSendMessages(gongWebhookHandler);
    transcriptQueue.grantConsumeMessages(transcriptProcessor);

    const api = new apigateway.RestApi(this, 'GongIntegrationApi', {
      restApiName: 'Gong Integration Service',
      description: 'API for Gong webhook integration',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true
      }
    });

    const webhookIntegration = new apigateway.LambdaIntegration(gongWebhookHandler);
    
    const webhookResource = api.root.addResource('webhook');
    const gongResource = webhookResource.addResource('gong');
    gongResource.addMethod('POST', webhookIntegration);

    new cdk.CfnOutput(this, 'GongWebhookUrl', {
      value: `${api.url}webhook/gong`,
      description: 'Gong webhook endpoint URL'
    });

    new cdk.CfnOutput(this, 'TranscriptQueueUrl', {
      value: transcriptQueue.queueUrl,
      description: 'SQS queue URL for transcript processing'
    });
  }
}