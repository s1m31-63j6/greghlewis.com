# syntax=docker/dockerfile:1.7
#
# AWS Lambda container image for the Religious Voices FastAPI service.
#
# Why AWS Lambda Web Adapter (LWA) and NOT Mangum:
#   - SSE streaming. Mangum buffers the full response before returning;
#     LWA runs your normal HTTP server inside the Lambda container and
#     streams responses through Lambda Function URLs (RESPONSE_STREAM
#     invoke mode) end-to-end. Required for our /chat SSE endpoint.
#   - No code changes. FastAPI runs exactly as it would locally; LWA
#     is just a Lambda extension that proxies Lambda events to the
#     local HTTP server.
#
# Base: a standard slim Python image (NOT the AWS Lambda Python base,
# whose ENTRYPOINT assumes a `<module>.<handler>` CMD and fights LWA).
# LWA registers itself as a Lambda extension at /opt/extensions/.

FROM public.ecr.aws/docker/library/python:3.11-slim

WORKDIR /app

# Lambda Web Adapter extension. The COPY --from is the recommended
# install path; LWA proxies HTTP traffic from Lambda Function URLs to
# AWS_LWA_PORT on localhost.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

# Tell LWA which port our HTTP server listens on and which path is the
# readiness probe.
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/health
ENV AWS_LWA_INVOKE_MODE=RESPONSE_STREAM

# Install runtime deps. Explicit list rather than `pip install .` so we
# skip the dev deps in pyproject.toml.
RUN pip install --no-cache-dir \
        httpx>=0.27 \
        beautifulsoup4>=4.12 \
        lxml>=5.2 \
        pydantic>=2.7 \
        pyyaml>=6.0 \
        tenacity>=8.3 \
        tiktoken>=0.7 \
        rich>=13.7 \
        sentence-transformers>=3.0 \
        chromadb>=0.5 \
        langchain>=0.3 \
        langchain-anthropic>=0.3 \
        langchain-chroma>=0.1.4 \
        langchain-huggingface>=0.1 \
        anthropic>=0.40 \
        fastapi>=0.115 \
        "uvicorn[standard]>=0.30" \
        sse-starlette>=2.1 \
        python-dotenv>=1.0

# Pre-download the sentence-transformer model weights into the image so
# Lambda cold starts don't pay the ~440 MB download. /tmp is the only
# writable path at Lambda runtime — but for BUILD time we cache under
# /app/.huggingface, and at runtime HF_HOME points there too.
ENV HF_HOME=/app/.huggingface
ENV TRANSFORMERS_CACHE=/app/.huggingface/hub
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')"

# After the model is baked in, force offline mode at runtime so HuggingFace
# doesn't burn ~30s trying (and failing, due to read-only FS) to write
# cache-check files. The weights are already on disk; we don't need
# network at startup.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

# Copy server code, leader manifest, and the persistent Chroma DB.
COPY server/ /app/server/
COPY leaders.yaml /app/leaders.yaml
COPY chroma_db/ /app/chroma_db/

# Run uvicorn as the main process. LWA intercepts Lambda invocations,
# turns them into HTTP requests to this server, and streams responses
# back through the Lambda Function URL.
CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
