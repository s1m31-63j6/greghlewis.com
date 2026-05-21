#!/usr/bin/env bash
# Deploy the Religious Voices Lambda — build container, push to ECR,
# create/update the Lambda function, return the Function URL.
#
# Idempotent: re-run any time to ship a new corpus or new server code.
#
# Required:
#   - AWS CLI v2 configured with profile $AWS_PROFILE (default: portfolio)
#   - Docker Desktop running
#   - ANTHROPIC_API_KEY in projects/religious-voices/.env
#
# Usage:
#   cd projects/religious-voices
#   ./deploy.sh

set -euo pipefail

# ---- Configuration ----
AWS_PROFILE="${AWS_PROFILE:-portfolio}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO="religious-voices"
IMAGE_TAG="latest"
LAMBDA_FN="religious-voices-api"
LAMBDA_MEMORY_MB="3008"   # ~3 GB so the sentence-transformer model fits
LAMBDA_TIMEOUT_S="120"     # Generous; typical chat ~10s
CORS_ORIGINS="https://greghlewis.com,http://localhost:3000"

# ---- Pre-flight ----
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Expected ANTHROPIC_API_KEY there." >&2
  exit 1
fi

AWS_ACCOUNT=$(aws --profile "$AWS_PROFILE" sts get-caller-identity --query Account --output text)
ECR_URL="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"

echo "▸ AWS account: ${AWS_ACCOUNT} | region: ${AWS_REGION}"
echo "▸ ECR repo:    ${ECR_URL}"
echo "▸ Lambda fn:   ${LAMBDA_FN}"
echo

# ---- 1. ECR repo (create if missing) ----
echo "[1/6] ECR repo…"
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" ecr describe-repositories \
    --repository-names "$ECR_REPO" >/dev/null 2>&1 || \
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" ecr create-repository \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true >/dev/null

# ---- 2. Docker build ----
echo "[2/6] Building container (linux/amd64)…"
# --provenance=false: newer BuildKit defaults to OCI image format, which
# Lambda rejects with "image manifest is not supported". The flag forces
# the legacy Docker v2 manifest that Lambda accepts.
docker buildx build --platform linux/amd64 --provenance=false \
  --load -t "${ECR_REPO}:${IMAGE_TAG}" .

# ---- 3. ECR login + push ----
echo "[3/6] Push to ECR…"
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" ecr get-login-password | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$ECR_URL"
docker push "$ECR_URL"

# Capture the image digest so we update Lambda to the EXACT image we just pushed
# (tag re-pushes don't trigger Lambda's image refresh without an explicit update).
IMAGE_DIGEST=$(aws --profile "$AWS_PROFILE" --region "$AWS_REGION" ecr describe-images \
  --repository-name "$ECR_REPO" --image-ids imageTag="$IMAGE_TAG" \
  --query 'imageDetails[0].imageDigest' --output text)
IMAGE_URI_DIGEST="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}@${IMAGE_DIGEST}"
echo "    image digest: ${IMAGE_DIGEST}"

# ---- 4. IAM role for Lambda ----
ROLE_NAME="${LAMBDA_FN}-role"
ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT}:role/${ROLE_NAME}"
echo "[4/6] IAM role ${ROLE_NAME}…"
if ! aws --profile "$AWS_PROFILE" iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws --profile "$AWS_PROFILE" iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
  aws --profile "$AWS_PROFILE" iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  # Wait a few seconds for IAM eventual consistency before Lambda uses the role.
  sleep 10
fi

# ---- 5. Lambda function ----
echo "[5/6] Lambda function…"
# Source the .env so ANTHROPIC_API_KEY is available
set -a; source .env; set +a
# JSON format for --environment because the CORS list contains commas,
# and the CLI shorthand "key=val,key2=val2" parser treats every comma
# as a record separator. JSON keeps it unambiguous.
ENV_JSON=$(python3 -c '
import json, os
print(json.dumps({"Variables": {
  "ANTHROPIC_API_KEY": os.environ["ANTHROPIC_API_KEY"],
  "NODE_ENV": "production",
  "RELIGIOUS_VOICES_CORS_ORIGIN": os.environ.get("RELIGIOUS_VOICES_CORS_ORIGIN", ""),
}}))
' RELIGIOUS_VOICES_CORS_ORIGIN="$CORS_ORIGINS")

if aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda get-function \
    --function-name "$LAMBDA_FN" >/dev/null 2>&1; then
  echo "    updating existing function…"
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda update-function-code \
    --function-name "$LAMBDA_FN" \
    --image-uri "$IMAGE_URI_DIGEST" >/dev/null
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda wait function-updated-v2 \
    --function-name "$LAMBDA_FN"
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda update-function-configuration \
    --function-name "$LAMBDA_FN" \
    --memory-size "$LAMBDA_MEMORY_MB" \
    --timeout "$LAMBDA_TIMEOUT_S" \
    --environment "$ENV_JSON" >/dev/null
else
  echo "    creating new function…"
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda create-function \
    --function-name "$LAMBDA_FN" \
    --package-type Image \
    --code "ImageUri=${IMAGE_URI_DIGEST}" \
    --role "$ROLE_ARN" \
    --memory-size "$LAMBDA_MEMORY_MB" \
    --timeout "$LAMBDA_TIMEOUT_S" \
    --environment "$ENV_JSON" \
    --architectures x86_64 >/dev/null
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda wait function-active-v2 \
    --function-name "$LAMBDA_FN"
fi

# ---- 6. Function URL with CORS + RESPONSE_STREAM ----
echo "[6/6] Lambda Function URL…"
if ! aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda get-function-url-config \
    --function-name "$LAMBDA_FN" >/dev/null 2>&1; then
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda create-function-url-config \
    --function-name "$LAMBDA_FN" \
    --auth-type NONE \
    --invoke-mode RESPONSE_STREAM \
    --cors "AllowOrigins=$(echo $CORS_ORIGINS | tr ',' '\n' | jq -R . | jq -sc),AllowMethods=GET,POST,OPTIONS,AllowHeaders=Content-Type,MaxAge=86400" >/dev/null
  aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda add-permission \
    --function-name "$LAMBDA_FN" \
    --statement-id "FunctionURLAllowPublicAccess" \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE >/dev/null
fi

FUNCTION_URL=$(aws --profile "$AWS_PROFILE" --region "$AWS_REGION" lambda get-function-url-config \
  --function-name "$LAMBDA_FN" --query FunctionUrl --output text)

echo
echo "✓ Deployed."
echo "  Function URL: ${FUNCTION_URL}"
echo
echo "  Next:"
echo "    Set these in Amplify env (https://console.aws.amazon.com/amplify/):"
echo "      RELIGIOUS_VOICES_API=${FUNCTION_URL%/}"
echo "      NEXT_PUBLIC_RELIGIOUS_VOICES_API=${FUNCTION_URL%/}"
echo "    Then trigger an Amplify redeploy."
