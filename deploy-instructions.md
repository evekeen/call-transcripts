# Deploy Gong Sync Lambda Function

## Prerequisites

1. **AWS CLI configured** with appropriate permissions:
   ```bash
   aws configure
   ```

2. **Disable AWS CLI pager** to avoid interactive mode:
   ```bash
   export AWS_PAGER=""
   ```

3. **Required environment variables** set in your shell:
   ```bash
   export SUPABASE_URL="your_supabase_url"
   export SUPABASE_SERVICE_KEY="your_service_key" 
   export GONG_API_KEY="your_gong_api_key"
   export GONG_API_SECRET="your_gong_secret"
   ```

## Quick Deployment

Run the deployment script:
```bash
./deploy-lambda.sh
```

This automated script will:
- Build the TypeScript project (`npm run build`)
- Create optimized deployment package (5.6 MB with only production dependencies)
- Set up IAM roles and policies with Secrets Manager access
- Deploy Lambda function with 15-minute timeout and 512MB memory
- Create EventBridge rule for **every 5 minutes** execution
- Configure all required permissions automatically

## What Gets Deployed

### Lambda Function Configuration
- **Name**: `periodicGongSync`
- **Runtime**: Node.js 18.x
- **Handler**: `dist/lambdas/periodicGongSync.handler`
- **Timeout**: 15 minutes (900 seconds)
- **Memory**: 512 MB
- **Package Size**: ~5.6 MB (optimized)

### Environment Variables
- `SYNC_DAYS`: Days to look back (default: 1)
- `SYNC_LIMIT`: Max calls per sync (default: 100)
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `GONG_API_KEY`: Gong API key for Basic Auth
- `GONG_API_SECRET`: Gong API secret for Basic Auth

### IAM Permissions
- `AWSLambdaBasicExecutionRole`: CloudWatch logging
- `SecretsManagerAccess`: Read `gong-api-credentials*` secrets
- EventBridge invoke permissions

### Automated Schedule
- **Frequency**: Every 5 minutes
- **EventBridge Rule**: `gong-sync-rule`
- **Target**: Lambda function with proper permissions

## Manual Step-by-Step Deployment

### 1. Build and Create Optimized Package
```bash
npm run build
node create-lambda-package.js  # Creates 5.6MB optimized package
```

### 2. Create IAM Role with Secrets Manager Access
```bash
aws iam create-role --role-name periodicGongSync-role --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

aws iam attach-role-policy \
  --role-name periodicGongSync-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy --role-name periodicGongSync-role --policy-name SecretsManagerAccess --policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:*:*:secret:gong-api-credentials*"
  }]
}'
```

### 3. Create Lambda Function
```bash
aws lambda create-function \
  --function-name periodicGongSync \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/periodicGongSync-role \
  --handler dist/lambdas/periodicGongSync.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 900 \
  --memory-size 512 \
  --environment "Variables={SYNC_DAYS=1,SYNC_LIMIT=100,SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,GONG_API_KEY=$GONG_API_KEY,GONG_API_SECRET=$GONG_API_SECRET}"
```

### 4. Create EventBridge Schedule (Every 5 Minutes)
```bash
aws events put-rule \
  --name gong-sync-rule \
  --schedule-expression "rate(5 minutes)" \
  --description "Trigger Gong sync every 5 minutes"

aws lambda add-permission \
  --function-name periodicGongSync \
  --statement-id gong-sync-rule-permission \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com

aws events put-targets \
  --rule gong-sync-rule \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:periodicGongSync"
```

## Testing and Monitoring

### Manual Test Invocation
```bash
aws lambda invoke --function-name periodicGongSync output.json --region us-east-1
cat output.json
```

**Expected successful output:**
```json
{
  "success": true,
  "platform": "gong",
  "summary": {
    "total": 1,
    "processed": 0,
    "skipped": 1,
    "errors": 0
  },
  "details": [
    {
      "callId": "6347474068722588703",
      "status": "skipped",
      "reason": "already_exists",
      "title": "Test call 2"
    }
  ],
  "executionTime": 1355
}
```

### View Real-Time Logs
```bash
aws logs tail /aws/lambda/periodicGongSync --follow --region us-east-1
```

### Check EventBridge Rule Status
```bash
aws events describe-rule --name gong-sync-rule --region us-east-1
aws events list-targets-by-rule --rule gong-sync-rule --region us-east-1
```

## How It Works

1. **EventBridge triggers Lambda every 5 minutes**
2. **Lambda fetches calls from last 24 hours** via Gong API
3. **Checks Supabase for existing transcripts** to avoid duplicates
4. **Downloads full transcripts with participant data** for new calls
5. **Uses account association service** to group calls by client company
6. **Stores transcripts and segments in Supabase** for searchable access
7. **Returns detailed sync report** with processed/skipped/error counts

## Configuration Options

- **SYNC_DAYS**: Number of days to look back (default: 1)
- **SYNC_LIMIT**: Maximum calls per sync (default: 100) 
- **Schedule**: Every 5 minutes via EventBridge (288 runs/day)

## Cost Considerations

Running every 5 minutes = 288 executions/day:
- **Lambda invocations**: ~$0.06/day (288 × $0.0000002)
- **Lambda duration**: ~$0.10/day (assumes 1.5s avg execution)
- **Total estimated cost**: ~$0.16/day or $4.80/month
- Consider adjusting frequency based on your call volume

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**: Run `node create-lambda-package.js` to include all dependencies
2. **"AWS_REGION reserved key"**: Don't set AWS_REGION manually - it's auto-provided
3. **Handler path issues**: Use `dist/lambdas/periodicGongSync.handler` (not `dist/src/...`)
4. **Package too large**: Use the optimized packaging script (creates 5.6MB vs 70MB)
5. **Interactive AWS CLI**: Set `export AWS_PAGER=""` to disable pager

### Debugging Steps
```bash
# Check function exists and configuration
aws lambda get-function --function-name periodicGongSync --region us-east-1

# View recent execution logs
aws logs filter-log-events --log-group-name /aws/lambda/periodicGongSync --region us-east-1 --start-time $(date -d '1 hour ago' +%s)000

# Test EventBridge rule manually
aws events put-events --entries Source=test,DetailType=test,Detail='{}' --region us-east-1
```