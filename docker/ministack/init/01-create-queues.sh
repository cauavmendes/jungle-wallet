#!/bin/sh
set -eu

ENDPOINT="http://localhost:4566"
REGION="us-east-1"

aws_sqs() { aws --endpoint-url "$ENDPOINT" --region "$REGION" sqs "$@"; }

DLQ_URL=$(aws_sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes FifoQueue=true \
  --query QueueUrl --output text)

DLQ_ARN=$(aws_sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

cat > /tmp/main-queue.json <<EOF
{
  "FifoQueue": "true",
  "VisibilityTimeout": "30",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"5\"}"
}
EOF

aws_sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes file:///tmp/main-queue.json

aws_sqs create-queue \
  --queue-name wallet-events.fifo \
  --attributes FifoQueue=true

echo "SQS queues created"