#!/bin/sh
# Installs the VaultWatch agent as a service on Linux. VaultWatch -> Integrations gives you this command:
#
#   curl -fsSL https://your-site/api/v1/agent/install.sh | sudo VAULTWATCH_URL=https://your-site VAULTWATCH_API_KEY=vw_live_... sh
#
# Optional: VAULTWATCH_RACK, VAULTWATCH_DATACENTER, VAULTWATCH_SERVER_ID.
# Remove it again with: ... | sudo sh -s -- --uninstall
set -eu

DIR=/opt/vaultwatch-agent
CONFIG=/etc/vaultwatch-agent.env
UNIT=/etc/systemd/system/vaultwatch-agent.service

fail() { echo "VaultWatch install failed: $1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "run it with sudo, because it installs a system service."
command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] || fail "this machine does not use systemd. Run agent.py directly instead."

if [ "${1:-}" = "--uninstall" ]; then
    systemctl disable --now vaultwatch-agent 2>/dev/null || true
    rm -rf "$DIR" "$CONFIG" "$UNIT"
    systemctl daemon-reload
    echo "VaultWatch agent removed."
    exit 0
fi

URL="${VAULTWATCH_URL:-}"
KEY="${VAULTWATCH_API_KEY:-}"
[ -n "$URL" ] || fail "VAULTWATCH_URL is not set."
[ -n "$KEY" ] || fail "VAULTWATCH_API_KEY is not set."
URL="${URL%/}"

# An empty batch is refused either way, but a bad key gets 401 or 403 before the body is looked at.
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/v1/telemetry/ingest" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"points":[]}') || fail "could not reach $URL."
case "$status" in
    401|403) fail "VaultWatch refused this API key. Create a new one in Integrations." ;;
    000) fail "could not reach $URL." ;;
esac

install_packages() {
    if command -v apt-get >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@" >/dev/null 2>&1 || { apt-get update -q >/dev/null 2>&1; DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@" >/dev/null 2>&1; }
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y -q "$@" >/dev/null 2>&1
    elif command -v yum >/dev/null 2>&1; then
        yum install -y -q "$@" >/dev/null 2>&1
    else
        return 1
    fi
}

command -v python3 >/dev/null 2>&1 || install_packages python3 || fail "install Python 3, then run this again."
rm -rf "$DIR/.venv"
mkdir -p "$DIR"
if ! python3 -m venv "$DIR/.venv" >/dev/null 2>&1; then
    rm -rf "$DIR/.venv"
    install_packages python3-venv || fail "could not install python3-venv."
    python3 -m venv "$DIR/.venv"
fi
# Disk failure prediction needs smartctl. The agent works without it.
command -v smartctl >/dev/null 2>&1 || install_packages smartmontools || echo "smartmontools was not installed, so disk failure prediction stays off."

for file in agent.py requirements.txt; do
    curl -fsSL "$URL/api/v1/agent/$file" -o "$DIR/$file" || fail "could not download $file from $URL."
done
"$DIR/.venv/bin/pip" install -q --disable-pip-version-check -r "$DIR/requirements.txt" || fail "could not install the agent's Python packages."

umask 077
cat > "$CONFIG" <<EOF
VAULTWATCH_URL="$URL"
VAULTWATCH_API_KEY="$KEY"
VAULTWATCH_RACK="${VAULTWATCH_RACK:-}"
VAULTWATCH_DATACENTER="${VAULTWATCH_DATACENTER:-}"
VAULTWATCH_SERVER_ID="${VAULTWATCH_SERVER_ID:-}"
EOF
umask 022

cat > "$UNIT" <<EOF
[Unit]
Description=VaultWatch telemetry agent
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$CONFIG
ExecStart=$DIR/.venv/bin/python -u $DIR/agent.py
Restart=always
RestartSec=10
# Exit code 2 means the API key was refused, so restarting cannot help.
RestartPreventExitStatus=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable -q vaultwatch-agent
systemctl restart vaultwatch-agent
sleep 3
systemctl is-active -q vaultwatch-agent || fail "the service did not start. See: journalctl -u vaultwatch-agent"
echo "VaultWatch agent installed and running. It starts automatically after a reboot."
echo "This server appears on your dashboard within a minute."
