"""DB connection helper — fetches credentials from Secrets Manager.

Default flow targets the comp-engine RDS micro (NflComparablesDb stack).
Pass `secret_arn=` and `database_name=` to target the Aurora SV2 cluster
(NflComparablesKb stack) — used by the KB schema bootstrap script.
"""

from __future__ import annotations

import json
import os
from contextlib import contextmanager

import boto3
import psycopg


_DEFAULT_STACK = "NflComparablesDb"
_DEFAULT_OUTPUT_KEY = "DbSecretArn"
_DEFAULT_ENV_VAR = "NFLCOMPARABLES_DB_SECRET_ARN"

# Cache resolved secrets by ARN so callers can hit two DBs without conflicts.
_secret_cache: dict[str, dict] = {}


def _region() -> str:
    return os.environ.get("AWS_REGION", "us-east-1")


def _resolve_secret_arn() -> str:
    """Find the comp-engine DB secret ARN from env or stack outputs."""
    arn = os.environ.get(_DEFAULT_ENV_VAR)
    if arn:
        return arn
    cfn = boto3.client("cloudformation", region_name=_region())
    outs = cfn.describe_stacks(StackName=_DEFAULT_STACK)["Stacks"][0]["Outputs"]
    for o in outs:
        if o["OutputKey"] == _DEFAULT_OUTPUT_KEY:
            return o["OutputValue"]
    raise RuntimeError(
        f"Could not resolve DB secret ARN. Either set {_DEFAULT_ENV_VAR} "
        f"or ensure the {_DEFAULT_STACK} stack is deployed."
    )


def _secret(secret_arn: str | None) -> dict:
    arn = secret_arn or _resolve_secret_arn()
    if arn in _secret_cache:
        return _secret_cache[arn]
    sm = boto3.client("secretsmanager", region_name=_region())
    raw = sm.get_secret_value(SecretId=arn)["SecretString"]
    _secret_cache[arn] = json.loads(raw)
    return _secret_cache[arn]


def conninfo(*, secret_arn: str | None = None, database_name: str | None = None) -> str:
    """Build a libpq connection string from a Secrets Manager-attached secret.

    `database_name` overrides whatever `dbname` is in the secret. Required
    for Aurora clusters where the auto-attached secret may not include
    `dbname` (only `host` / `port` / `username` / `password` / `engine`).
    """
    s = _secret(secret_arn)
    dbname = database_name or s.get("dbname")
    if not dbname:
        raise RuntimeError(
            "No database name resolved. Pass database_name=... or ensure "
            "the secret has a 'dbname' field."
        )
    return (
        f"host={s['host']} port={s['port']} dbname={dbname} "
        f"user={s['username']} password={s['password']} "
        f"sslmode=require"
    )


@contextmanager
def connect(*, secret_arn: str | None = None, database_name: str | None = None):
    """Yield a psycopg connection. Use as `with connect() as conn:`."""
    with psycopg.connect(
        conninfo(secret_arn=secret_arn, database_name=database_name)
    ) as conn:
        yield conn
