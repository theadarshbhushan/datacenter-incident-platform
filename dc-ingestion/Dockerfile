FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
# In a container the agent would report the container, not the host, so the image runs the
# simulated fleet by default (docker compose --profile agent). Run agent.py directly on real hosts.
CMD ["python", "agent.py", "--simulate", "6", "--backfill-hours", "6"]
