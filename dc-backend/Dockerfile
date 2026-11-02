FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# The agent and its installers, served at /api/v1/agent/. docker compose supplies the "ingestion" context.
COPY --from=ingestion agent.py requirements.txt install.sh install.ps1 /app/agent_dist/

RUN useradd --create-home --uid 10001 vaultwatch && chown -R vaultwatch /app
USER vaultwatch

EXPOSE 8000

# A single worker keeps the in-memory rate limiter consistent; move limits to Redis before scaling out.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
