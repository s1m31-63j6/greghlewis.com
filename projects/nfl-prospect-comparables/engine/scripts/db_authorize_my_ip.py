"""Authorize the current public IP for ingress on the DB security group.

Reads SG ID + DB endpoint from the NflComparablesDb CloudFormation outputs,
detects the host's current public IP, adds (or refreshes) an ingress rule.
Idempotent — running again with a new IP adds a rule but doesn't remove old.

Run from engine/:
    uv run python scripts/db_authorize_my_ip.py
    uv run python scripts/db_authorize_my_ip.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

import boto3
import requests
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()


STACK_NAME = "NflComparablesDb"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    region = os.environ.get("AWS_REGION", "us-east-1")
    cfn = boto3.client("cloudformation", region_name=region)
    ec2 = boto3.client("ec2", region_name=region)

    outs = cfn.describe_stacks(StackName=STACK_NAME)["Stacks"][0]["Outputs"]
    by_key = {o["OutputKey"]: o["OutputValue"] for o in outs}
    sg_id = by_key["DbSecurityGroupId"]
    endpoint = by_key["DbEndpoint"]

    my_ip = requests.get("https://ifconfig.me/ip", timeout=5).text.strip()
    cidr = f"{my_ip}/32"

    print(f"Stack:   {STACK_NAME}")
    print(f"DB:      {endpoint}")
    print(f"SG:      {sg_id}")
    print(f"My IP:   {my_ip}")
    print(f"Rule:    INGRESS tcp/5432 from {cidr}")

    if args.dry_run:
        print("(dry-run — no change)")
        return 0

    try:
        ec2.authorize_security_group_ingress(
            GroupId=sg_id,
            IpPermissions=[{
                "IpProtocol": "tcp",
                "FromPort": 5432,
                "ToPort": 5432,
                "IpRanges": [{
                    "CidrIp": cidr,
                    "Description": f"developer ingress ({my_ip})",
                }],
            }],
        )
        print("✓ ingress rule added")
    except ClientError as e:
        if e.response["Error"]["Code"] == "InvalidPermission.Duplicate":
            print("✓ rule already present (no change)")
        else:
            raise
    return 0


if __name__ == "__main__":
    sys.exit(main())
