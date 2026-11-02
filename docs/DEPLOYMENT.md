# Deploying VaultWatch

This puts VaultWatch on a public HTTPS address, so agents on other machines can reach it.

## What you need

- A Linux server with a public IP, 2 GB of memory and Docker installed.
- A domain name, with an A record pointing to that server, for example `vaultwatch.example.com`.
- Ports 80 and 443 open on the server. Caddy uses them to get and renew the HTTPS certificate by itself.
- Your MongoDB Atlas database. In Atlas, go to **Network Access** and add the server's IP.

## 1. Configure

```bash
git clone https://github.com/theadarshbhushan/datacenter-incident-platform.git
cd datacenter-incident-platform
cp .env.example .env
```

Set these in `.env`:

| Setting | Value |
| --- | --- |
| `DOMAIN` | Your domain, without `https://` |
| `SECRET_KEY` | The output of `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `MONGO_URI`, `MONGO_DB_NAME` | Your Atlas connection string and database name |
| `EMAIL_BACKEND=smtp`, `EMAIL_FROM`, `SMTP_*` | Your email settings |

`ENVIRONMENT=production`, `FRONTEND_URL` and `CORS_ORIGINS` are set for you by `docker-compose.prod.yml`.

## 2. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Open `https://your-domain`. The first visit can take a minute while the certificate is issued.

## 3. Connect servers

1. Sign in and open **Integrations**.
2. Create an API key.
3. Under **Install the agent on a server**, choose the operating system and copy the command.
4. Run it on each server: in a terminal with sudo on Linux, or in PowerShell as Administrator on Windows.

The server appears on the dashboard within a minute and keeps reporting after a restart. The anomaly model starts scoring it after 4 hours of history.

To remove the agent on Linux:

```bash
curl -fsSL https://your-domain/api/v1/agent/install.sh | sudo sh -s -- --uninstall
```

On Windows, set `$env:VAULTWATCH_UNINSTALL='1'` and run the install command again.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Run the install command again on a server to update its agent.

## Good to know

- Keep one backend worker. Rate limits are held in memory, so move them to Redis before scaling out.
- The API key is stored on each server, readable only by root or administrators. Create one key per group of servers, so you can revoke them separately.
- The install command contains the API key, so it may be kept in that machine's shell history.
