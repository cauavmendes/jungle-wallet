
set -eu

ENDPOINT="http://localhost:4566"
REGION="us-east-1"

# Atalho para não repetir endpoint e região em todo comando.
aws_sqs() { aws --endpoint-url "$ENDPOINT" --region "$REGION" sqs "$@"; }

# 1. A DLQ precisa existir antes, porque a fila principal aponta para ela.
DLQ_URL=$(aws_sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes FifoQueue=true \
  --query QueueUrl --output text)

# 2. Descobre o ARN (o "endereço completo") da DLQ.
DLQ_ARN=$(aws_sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

# 3. Fila principal: após 5 recebimentos sem sucesso, a mensagem vai para a DLQ.
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

echo "SQS queues created"