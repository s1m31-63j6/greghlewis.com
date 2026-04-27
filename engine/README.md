# engine

Python workspace for the NFL Prospect Comparables project: data ingestion, feature engineering, embedding pipelines, and evaluation.

## Layout

```
src/engine/
  ingest/    pulling from public sources (nflverse, CFBD, scouting text)
  io/        S3 read/write helpers
scripts/     runnable entry points (smoke tests, one-off jobs)
```

## Setup

```
uv sync                  # creates .venv and installs locked deps
cp .env.example .env     # then fill in your CFBD API key
```

CFBD API key: free, sign up at https://collegefootballdata.com/

## AWS

Reads/writes the buckets provisioned by `../infra/`. Uses the local `portfolio` AWS profile by default.
