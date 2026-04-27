# infra

AWS CDK stacks for the `portfolio` AWS account (ID `397483229232`). Python CDK; CDK CLI pinned per-project via `package.json`.

## Setup

```
uv sync                     # install Python deps (aws-cdk-lib, constructs)
npm install                 # install CDK CLI locally (pinned)
```

## Common commands

All CDK commands run from this directory, prefixed with `npx` so they use the locally-pinned CLI:

```
npx cdk synth                      # render CloudFormation template
npx cdk diff                       # diff against deployed
npx cdk deploy --profile portfolio # deploy (always specify profile)
npx cdk bootstrap --profile portfolio aws://397483229232/us-east-1   # one-time
```

## Stacks

- **`NflComparablesData`** — Raw + curated S3 buckets and a managed IAM policy for engine read/write access. No compute, no DB. (Phase 0.)
