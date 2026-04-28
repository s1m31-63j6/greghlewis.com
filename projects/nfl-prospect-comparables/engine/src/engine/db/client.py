"""DB connection helper — fetches credentials from Secrets Manager."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager

import boto3
import psycopg


# Cache the resolved secret to avoid Secrets Manager calls on every connection.
_secret_cache: dict | None = None


def _resolve_secret_arn() -> str:
    """Find the DB secret ARN. Prefers env var; falls back to CloudFormation
    output of the NflComparablesDb stack."""
    arn = os.environ.get("NFLCOMPARABLES_DB_SECRET_ARN")
    if arn:
        return arn
    region = os.environ.get("AWS_REGION", "us-east-1")
    cfn = boto3.client("cloudformation", region_name=region)
    outs = cfn.describe_stacks(StackName="NflComparablesDb")["Stacks"][0]["Outputs"]
    for o in outs:
        if o["OutputKey"] == "DbSecretArn":
            return o["OutputValue"]
    raise RuntimeError(
        "Could not resolve DB secret ARN. Either set NFLCOMPARABLES_DB_SECRET_ARN "
        "or ensure the NflComparablesDb stack is deployed."
    )


def _secret() -> dict:
    """Resolve DB credentials. Caches in-process."""
    global _secret_cache
    if _secret_cache is not None:
        return _secret_cache
    arn = _resolve_secret_arn()
    sm = boto3.client("secretsmanager", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    raw = sm.get_secret_value(SecretId=arn)["SecretString"]
    _secret_cache = json.loads(raw)
    return _secret_cache


def conninfo() -> str:
    s = _secret()
    return (
        f"host={s['host']} port={s['port']} dbname={s['dbname']} "
        f"user={s['username']} password={s['password']} "
        f"sslmode=require"
    )


@contextmanager
def connect():
    """Yield a psycopg connection. Use as `with connect() as conn:`."""
    with psycopg.connect(conninfo()) as conn:
        yield conn
