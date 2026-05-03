"""Wire the IAM compute role created by NflComparablesHosting onto the
Amplify app via boto3.

Run after ``cdk deploy NflComparablesHosting`` (and any time the stack
recreates the role). The CDK stack's AwsCustomResource Lambda uses an
older AWS SDK that doesn't recognize ``computeRoleArn`` and would
silently drop it from UpdateApp calls — see the stack module docstring
for the full story.

Reads the role ARN from the stack's CloudFormation output, then
attaches it to the Amplify app via boto3 (current SDK).

Usage:
    AWS_PROFILE=portfolio uv run --with boto3 \
        python infra/scripts/wire_amplify_compute_role.py
"""

import sys

import boto3

APP_ID = "dhpo309lbx6w7"
STACK_NAME = "NflComparablesHosting"
REGION = "us-east-1"


def main() -> int:
    cfn = boto3.client("cloudformation", region_name=REGION)
    outputs = cfn.describe_stacks(StackName=STACK_NAME)["Stacks"][0]["Outputs"]
    role_arn = next(
        (o["OutputValue"] for o in outputs if o["OutputKey"] == "ComputeRoleArn"),
        None,
    )
    if not role_arn:
        print(f"!! No ComputeRoleArn output on stack {STACK_NAME}", file=sys.stderr)
        return 1

    amplify = boto3.client("amplify", region_name=REGION)
    resp = amplify.update_app(appId=APP_ID, computeRoleArn=role_arn)
    actual = resp["app"].get("computeRoleArn")
    if actual != role_arn:
        print(
            f"!! Amplify did not persist computeRoleArn (sent={role_arn}, got={actual})",
            file=sys.stderr,
        )
        return 1

    print(f"OK — Amplify app {APP_ID} now has computeRoleArn = {role_arn}")
    print(
        "Trigger a rebuild so the SSR Lambda picks up the new role:\n"
        f"  aws amplify start-job --app-id {APP_ID} --branch-name main --job-type RELEASE"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
