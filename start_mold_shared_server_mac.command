#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/Mold Program/Dashboard App"
SERVER_SCRIPT="$APP_DIR/mold_shared_server_mac.py"
URL="http://127.0.0.1:3212/mold_dashboard.html"
HEALTH_URL="http://127.0.0.1:3212/api/health"
LOG_FILE="/tmp/mold_shared_server_mac.log"

echo "Starting Mold shared server..."
echo "Dashboard URL: $URL"
echo "Shared data file: $APP_DIR/mold_shared_rows.json"
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is not installed on this Mac."
  echo "Please install Python 3 first, then run this file again."
  echo "https://www.python.org/downloads/macos/"
  echo
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit 1
fi

check_health() {
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1
}

if ! check_health; then
  nohup python3 "$SERVER_SCRIPT" >"$LOG_FILE" 2>&1 &
fi

READY=0
for _ in $(seq 1 25); do
  if check_health; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Server did not start correctly."
  if [ -f "$LOG_FILE" ]; then
    echo
    echo "Last log lines:"
    tail -n 20 "$LOG_FILE"
  else
    echo "No log file found: $LOG_FILE"
  fi
  echo
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit 1
fi

open "$URL"
exit 0
