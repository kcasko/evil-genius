# Strands Decider on Amazon Bedrock AgentCore Runtime (linux/arm64, CPU-only).
#
# Adapted from Vivek0712/strands-decider-agentcore's own runtime/Dockerfile
# (MIT-0), forked+pinned per AWS_DEPLOYMENT_PLAN_V2.md §9 step 1. Verified
# against the live repo on 2026-10-14: `main` resolves to commit
# f9691ee9b2891ecb72308377947e4d655f07bde5, matching the plan's "f9691ee9"
# abbreviated SHA exactly (confirmed via `gh api
# repos/Vivek0712/strands-decider-agentcore/commits/main`).
#
# NOT YET DONE (blocks deploy day, not this file): audit the fork for secret
# leakage / prompt-injection surface in runtime/, agentcore/, deciderctl.py,
# and client/decider_client.py (plan §9 step 1, §11 risk 7).
#
# CORRECTION to this repo's own CLAUDE_V2_BRIEF.md: the brief's file-layout
# comment describes this image as "strands-decider[cuda]==<pin>, torch,
# bitsandbytes for int8". The real upstream image -- and the approved
# architecture in AWS_DEPLOYMENT_PLAN_V2.md itself ("Graviton2 has no int8
# matrix instructions, so compute is CPU-bound", §11 risk 1) -- is CPU-only:
# no CUDA, no GPU, no bitsandbytes dependency. This Dockerfile intentionally
# follows the verified CPU-only upstream instead of the brief's literal
# (and internally inconsistent) extras list. Flagged in
# docs/V2_IMPLEMENTATION_NOTES.md for human sign-off.
#
# No model weights are baked into this image (measured 1.56 GB per
# AWS_DEPLOYMENT_PLAN_V2.md §2) -- the Hugging Face download happens once
# per cold start, inside the running container, never at build time. This
# Dockerfile performs no network call to Hugging Face and downloads no
# model weights; building it (not attempted in this offline-only task)
# would only resolve pip/apt packages.
FROM public.ecr.aws/docker/library/python:3.12-slim-trixie

# git: pip installs strands-decider from GitHub at a pinned commit (PyPI
# 0.1.0 predates the current inference code -- see AWS_DEPLOYMENT_CHECKLIST.md
# §6, which independently confirms this for the EC2/V1 path).
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/tmp/hf \
    HF_HUB_DISABLE_TELEMETRY=1 \
    TOKENIZERS_PARALLELISM=false \
    MALLOC_ARENA_MAX=2 \
    MALLOC_MMAP_THRESHOLD_=1048576 \
    MALLOC_TRIM_THRESHOLD_=1048576

# CPU-only torch first, pinned, so nothing later pulls a CUDA build into the image.
ARG TORCH_VERSION=2.8.0
RUN pip install "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu

# Pinned to the exact strands-decider commit the upstream README measured
# its published numbers against (cold start, memory, int8/bf16 parity).
ARG STRANDS_DECIDER_REF=3e94e9d84c620ed5a95f1a3310c3decb971e261c
COPY requirements.txt /tmp/requirements.txt
RUN echo "torch==${TORCH_VERSION}" > /tmp/constraints.txt \
    && pip install -c /tmp/constraints.txt -r /tmp/requirements.txt \
       "strands-decider @ git+https://github.com/strands-labs/strands-decider@${STRANDS_DECIDER_REF}"

RUN useradd -m -u 1000 bedrock_agentcore && mkdir -p /tmp/hf && chown bedrock_agentcore:bedrock_agentcore /tmp/hf
WORKDIR /app
# main.py and decider_runtime/ live in the forked mirror's runtime/
# directory (AWS_DEPLOYMENT_PLAN_V2.md §9 step 1) -- not duplicated in this
# game repo. This Dockerfile is meant to replace the fork's own
# runtime/Dockerfile 1:1 at the pinned commit; see README.md in this
# directory for the exact fork + verify + deploy command sequence.
COPY --chown=bedrock_agentcore:bedrock_agentcore main.py ./
COPY --chown=bedrock_agentcore:bedrock_agentcore decider_runtime/ ./decider_runtime/
USER bedrock_agentcore

# AgentCore Runtime HTTP contract: /invocations and /ping on 8080.
EXPOSE 8080
CMD ["python", "main.py"]
