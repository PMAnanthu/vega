#!/bin/bash
cd "$(dirname "$0")"

# Stop any process using port 3000
EXISTING=$(lsof -ti tcp:3000 2>/dev/null | tr -d '[:space:]')
if [ -n "$EXISTING" ]; then
  echo "Stopping existing server (PID $EXISTING)…"
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

echo "Starting Vega…"
node server.js
