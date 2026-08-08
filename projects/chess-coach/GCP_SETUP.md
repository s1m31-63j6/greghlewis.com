# Greg — GCP setup checklist (one afternoon)

This is what only you can do. Everything else (Terraform, Cloud Run service,
frontend) is written and waiting on the values captured below.

The whole point of this phase is **blast-radius isolation**: a brand-new GCP
project on a personal billing account, with nothing shared with Elevator. The
project is the IAM and quota boundary; the billing account is the money
boundary. Both are new.

> **Phases 1–7 provision nothing that costs money.** The meter starts in
> `DEPLOY.md` when the Cloud Run service goes up. Phase 8 sets the budget
> alarm before that happens.

---

## Phase 1 — Install local tooling

```bash
brew install --cask google-cloud-sdk
brew install terraform
brew install stockfish        # native engine for the offline calibration harness
```

Verify:

```bash
gcloud --version      # Google Cloud SDK ≥ 500
terraform version     # ≥ 1.9
stockfish             # then type `uci` — expect `uciok`; `quit` to exit
```

`uv` and Docker are already installed on this machine, so nothing to do there.

---

## Phase 2 — Create an isolated project on a personal billing account

Do this in an **incognito window** so it doesn't pick up an Elevator-related
Google session.

1. Go to https://console.cloud.google.com and sign in with your **personal**
   Google account — not a BYU or Elevator identity.
2. **Billing → Manage billing accounts → Create account.** New GCP accounts get
   a $300 / 90-day free trial. Attach your own card. If a billing account
   already exists on this login, confirm it is not shared with anything else
   before reusing it.
3. Create the project:

```bash
gcloud auth login                              # personal account, in the browser
gcloud projects create greg-chess-coach --name="Chess Coach"
gcloud config set project greg-chess-coach

# Find the billing account you just made, then link it
gcloud billing accounts list
gcloud billing projects link greg-chess-coach --billing-account=<BILLING_ACCOUNT_ID>
```

**Sanity check that this is actually isolated** — the output should list only
the new project, and its billing account should be the personal one:

```bash
gcloud projects list
gcloud billing projects describe greg-chess-coach
```

**Captures from Phase 2 (write these down):**
- [ ] Project ID (`greg-chess-coach`, or whatever the name collision forced)
- [ ] Project number (`gcloud projects describe greg-chess-coach --format='value(projectNumber)'`)
- [ ] Billing account ID

---

## Phase 3 — Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com
```

Takes a couple of minutes. Confirm:

```bash
gcloud services list --enabled
```

---

## Phase 4 — Enable Claude in Vertex AI Model Garden

**This one is a console click — there is no CLI equivalent**, because it
requires accepting Anthropic's terms of service interactively.

1. Go to https://console.cloud.google.com/vertex-ai/model-garden
2. Search for **Claude Opus** and open the model card.
3. Click **Enable** and accept the terms.

**Then verify it actually works before we write any backend code**, because
Anthropic model availability on Vertex is gated per-region and the failure mode
is a confusing 404 rather than a clear "not enabled" error:

```bash
gcloud auth application-default login       # sets up ADC for local dev

curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://aiplatform.googleapis.com/v1/projects/greg-chess-coach/locations/global/publishers/anthropic/models/claude-opus-5:streamRawPredict" \
  -d '{
    "anthropic_version": "vertex-2023-10-16",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "Reply with exactly: OK"}]
  }'
```

Expect a JSON response containing `OK`.

- We use the **`global`** endpoint by default — it's the recommended one and it
  dodges per-region capacity problems.
- If `global` 404s, retry the same call with `us-east5` substituted for
  `global` in both the hostname (`us-east5-aiplatform.googleapis.com`) and the
  path. `us-east5` is the usual home for Anthropic models on Vertex.

**Captures from Phase 4:**
- [ ] Working region (`global`, or the fallback that worked)

---

## Phase 5 — Firestore (durable rate limiting)

Native mode, single region, same location family as everything else:

```bash
gcloud firestore databases create --location=nam5 --type=firestore-native
```

`nam5` is the US multi-region. Free tier covers 50k reads / 20k writes per day,
which is far more than a rate limiter on a portfolio site will ever use.

---

## Phase 6 — Artifact Registry (container images)

```bash
gcloud artifacts repositories create chess-coach \
  --repository-format=docker \
  --location=us-central1 \
  --description="Chess Coach Cloud Run images"

gcloud auth configure-docker us-central1-docker.pkg.dev
```

> **Mac ARM gotcha, applies at every image build:** Cloud Run runs x86-64. A
> plain `docker build` on this machine produces an arm64 image that starts and
> then dies with an exec-format error that reads like a broken entrypoint.
> Always build with `--platform linux/amd64`. This is baked into the build
> script, but it's the first thing to check if the service won't boot.

---

## Phase 7 — Service account

Least privilege — the runtime identity gets exactly two roles, and no key file
is ever created (Cloud Run injects the identity; local dev uses your ADC):

```bash
gcloud iam service-accounts create chess-coach-run \
  --display-name="Chess Coach Cloud Run runtime"

SA="chess-coach-run@greg-chess-coach.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding greg-chess-coach \
  --member="serviceAccount:${SA}" --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding greg-chess-coach \
  --member="serviceAccount:${SA}" --role="roles/datastore.user"
```

Confirm nothing extra crept in:

```bash
gcloud projects get-iam-policy greg-chess-coach \
  --flatten="bindings[].members" \
  --filter="bindings.members:chess-coach-run" \
  --format="table(bindings.role)"
```

Expect exactly `roles/aiplatform.user` and `roles/datastore.user`.

**No JSON key is generated on purpose.** A downloaded service-account key is a
long-lived credential sitting on disk; workload identity on Cloud Run and ADC
locally both avoid one entirely.

---

## Phase 8 — Budget alarm (do this before the first deploy)

A public endpoint that calls Opus is real spend exposure — the same exposure
documented in the Glass Box RAG stack comments, where reserved concurrency
couldn't be used as a ceiling. Here the ceilings are Cloud Run max-instances,
the Firestore daily token cap, and this alarm.

Console → **Billing → Budgets & alerts → Create budget**:
- Scope: the `greg-chess-coach` project only
- Amount: **$20/month**
- Alert thresholds: 50%, 90%, 100% — email to greghlewis@gmail.com

---

## Phase 9 — Terraform state bucket

Local state works but is the wrong thing to demonstrate on a portfolio piece,
and it's lost the moment the laptop is. A GCS backend costs cents:

```bash
gcloud storage buckets create gs://greg-chess-coach-tfstate \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets update gs://greg-chess-coach-tfstate --versioning
```

---

## Values to hand back

Once the above is done, paste these into the chat and the Terraform + backend
work can proceed:

```
PROJECT_ID       = greg-chess-coach
PROJECT_NUMBER   = ...
BILLING_ACCOUNT  = ...
VERTEX_REGION    = global          # or the Phase 4 fallback
ARTIFACT_REPO    = us-central1-docker.pkg.dev/greg-chess-coach/chess-coach
TF_STATE_BUCKET  = greg-chess-coach-tfstate
```

Also confirm the Phase 4 `curl` returned `OK` — that's the one step that can't
be worked around later.

---

## What this costs

**$0 through Phase 9.** Nothing above provisions a billable resource: API
enablement, an empty Firestore database, an empty Artifact Registry repo, a
service account, and an empty state bucket are all free or sub-cent. Spend
begins with `terraform apply` in `DEPLOY.md`.

---

## Note on who runs deploys

`terraform apply` and `gcloud run deploy` are blocked by the Claude Code
permission classifier, the same way `cdk deploy` already is for the AWS
stacks. Every deploy step is written into `DEPLOY.md` as a copy-paste command
for you to run, and the output values get pasted back into the chat.
