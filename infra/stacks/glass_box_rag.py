"""Glass Box RAG — orchestrator Lambda + public Function URL.

Why a dedicated Lambda rather than the shared Amplify SSR route:
Amplify WEB_COMPUTE *buffers* SSR responses instead of streaming them (measured:
all 94 SSE events from the live Religious Voices endpoint arrived simultaneously
at 12.4s), and its CloudFront terminates the origin at ~30s. A Function URL in
RESPONSE_STREAM mode delivers frames incrementally from 0.4s out past 90s, which
is what a live pipeline visualization requires.
"""

from aws_cdk import CfnOutput, Duration, Stack
from aws_cdk import aws_iam as iam
from aws_cdk import aws_lambda as lambda_
from constructs import Construct

# Corpus + vectors are ~6 MB, so they ship inside the bundle. No S3 round trip,
# no extra IAM, no cold-start fetch.
# Relative to infra/, where the CDK app runs. Run `npm run bundle` first.
ORCHESTRATOR_DIR = "../projects/glass-box-rag/orchestrator/dist"

SONNET = "us.anthropic.claude-sonnet-4-6"
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
RERANK_MODEL = "cohere.rerank-v3-5:0"


class GlassBoxRagStack(Stack):
    def __init__(self, scope: Construct, cid: str, *, allowed_origin: str, **kwargs):
        super().__init__(scope, cid, **kwargs)
        account, region = self.account, self.region

        fn = lambda_.Function(
            self,
            "Orchestrator",
            runtime=lambda_.Runtime.NODEJS_22_X,
            handler="index.handler",
            # Built locally by `npm run bundle` in the orchestrator dir, which
            # esbuilds the TS and copies the corpus artifacts into dist/data.
            # Deliberately not Docker bundling: it would add a Docker dependency
            # to every deploy for a build that takes under a second.
            code=lambda_.Code.from_asset(ORCHESTRATOR_DIR),
            memory_size=2048,  # the dense scan is a 759x1024 dot product per query
            timeout=Duration.minutes(5),
            environment={
                "GBRAG_AWS_ACCOUNT": account,
                "GBRAG_ALLOWED_ORIGIN": allowed_origin,
                "GBRAG_DATA_DIR": "/var/task/data",
                "NODE_OPTIONS": "--enable-source-maps",
            },
        )

        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                resources=[
                    f"arn:aws:bedrock:{region}:{account}:inference-profile/{SONNET}",
                    f"arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6*",
                    f"arn:aws:bedrock:{region}::foundation-model/{EMBED_MODEL}",
                    f"arn:aws:bedrock:{region}::foundation-model/{RERANK_MODEL}",
                ],
            )
        )
        # bedrock:Rerank takes no resource-level scoping.
        fn.add_to_role_policy(
            iam.PolicyStatement(actions=["bedrock:Rerank"], resources=["*"])
        )

        url = fn.add_function_url(
            auth_type=lambda_.FunctionUrlAuthType.NONE,
            invoke_mode=lambda_.InvokeMode.RESPONSE_STREAM,
            cors=lambda_.FunctionUrlCorsOptions(
                allowed_origins=[allowed_origin],
                allowed_methods=[lambda_.HttpMethod.GET, lambda_.HttpMethod.POST],
                allowed_headers=["content-type"],
            ),
        )

        # NOTE: a public Function URL needs BOTH `lambda:InvokeFunctionUrl` and
        # `lambda:InvokeFunction`. With only the first it returns 403 indefinitely,
        # which reads like an account-level block rather than a missing grant.
        # This CDK version emits both from `add_function_url`, so nothing extra is
        # needed here — but if you ever build a Function URL by hand (boto3, CLI,
        # raw CloudFormation), you must add the second yourself, and it does NOT
        # accept the FunctionUrlAuthType condition key.

        CfnOutput(self, "FunctionUrl", value=url.url)
        CfnOutput(self, "FunctionName", value=fn.function_name)
