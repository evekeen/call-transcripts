#!/bin/bash
set -e

# Disable AWS CLI pager to avoid interactive mode
export AWS_PAGER=""

# Configuration
FUNCTION_NAME="periodicGongSync"
REGION="us-east-1"
RUNTIME="nodejs18.x"
HANDLER="dist/lambdas/periodicGongSync.handler"
TIMEOUT="900"
MEMORY="512"
SCHEDULE_NAME="gong-sync-schedule"
RULE_NAME="gong-sync-rule"

# Build the project
echo "Building project..."
npm run build

# Create optimized deployment package
echo "Creating optimized deployment package..."
node create-lambda-package.js

# Create IAM role if it doesn't exist
echo "Creating IAM role..."
aws iam create-role --role-name ${FUNCTION_NAME}-role --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}' --region $REGION || echo "Role already exists"

# Attach basic execution policy
aws iam attach-role-policy \
  --role-name ${FUNCTION_NAME}-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --region $REGION

# Create custom policy for Secrets Manager access
aws iam put-role-policy --role-name ${FUNCTION_NAME}-role --policy-name SecretsManagerAccess --policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:gong-api-credentials*"
    }
  ]
}' --region $REGION

# Get account ID for role ARN
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${FUNCTION_NAME}-role"

echo "Waiting for role to propagate..."
sleep 2

# Create or update Lambda function
echo "Creating/updating Lambda function..."
aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime $RUNTIME \
  --role $ROLE_ARN \
  --handler $HANDLER \
  --zip-file fileb://lambda-deployment.zip \
  --timeout $TIMEOUT \
  --memory-size $MEMORY \
  --environment "Variables={SYNC_DAYS=1,SYNC_LIMIT=100,SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,GONG_API_KEY=$GONG_API_KEY,GONG_API_SECRET=$GONG_API_SECRET}" \
  --region $REGION 2>/dev/null || {
    echo "Function creation failed, checking if function exists..."
    if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION >/dev/null 2>&1; then
      echo "Function exists, updating..."
      aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://lambda-deployment.zip \
        --region $REGION
      
      aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout $TIMEOUT \
        --memory-size $MEMORY \
        --environment "Variables={SYNC_DAYS=1,SYNC_LIMIT=100,SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,GONG_API_KEY=$GONG_API_KEY,GONG_API_SECRET=$GONG_API_SECRET}" \
        --region $REGION
    else
      echo "❌ Function creation failed and function doesn't exist. Check IAM permissions and role ARN."
      exit 1
    fi
  }

# Create EventBridge rule for every 5 minutes
echo "Creating EventBridge rule..."
aws events put-rule \
  --name $RULE_NAME \
  --schedule-expression "rate(5 minutes)" \
  --description "Trigger Gong sync every 5 minutes" \
  --region $REGION

# Add permission for EventBridge to invoke Lambda
echo "Adding EventBridge permission..."
aws lambda add-permission \
  --function-name $FUNCTION_NAME \
  --statement-id ${RULE_NAME}-permission \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
  --region $REGION || echo "Permission already exists"

# Add Lambda as target to EventBridge rule
echo "Adding Lambda target to EventBridge rule..."
aws events put-targets \
  --rule $RULE_NAME \
  --targets "Id"="1","Arn"="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}" \
  --region $REGION

echo "Cleaning up..."
rm lambda-deployment.zip

echo "✅ Deployment complete!"
echo "Function name: $FUNCTION_NAME"
echo "Schedule: Every 5 minutes"
echo "Region: $REGION"
echo ""
echo "To test manually:"
echo "aws lambda invoke --function-name $FUNCTION_NAME --region $REGION output.json"
echo ""
echo "To view logs:"
echo "aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"