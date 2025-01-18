#!/usr/bin/env bash
set -e

export REDIS_PORT="${REDIS_PORT:-6379}"
AUTOSSH_PID=
NODE_PID=

function isRunning() {
  if [ ! -f /tmp/tunnel.pid ]; then
    return 1
  fi

  pid=$(cat "/tmp/tunnel.pid")

  if [ ! -d "/proc/$pid" ]; then
    return 1
  fi

  if [ "$(cat "/proc/$pid/comm")" != "autossh" ]; then
    return 1
  fi
  return 0
}

function init() {
  if [ -n "$REDIS_SSH_HOST" ]; then
    REDIS_SSH_PORT="${REDIS_SSH_PORT:-22}"
    REDIS_SSH_USER="${REDIS_SSH_USER:-root}"

    if ! isRunning; then
      echo "Starting up authSSH..."
      # Set up ssh tunneling
      AUTOSSH_PIDFILE=/tmp/tunnel.pid AUTOSSH_GATETIME=0 AUTOSSH_PORT=0 autossh -f -N -L "6380:127.0.0.1:${REDIS_PORT}" \
        -p "$REDIS_SSH_PORT" \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -o ConnectTimeout=10 \
        -o TCPKeepAlive=yes \
        -i /app/sshkey \
        "$REDIS_SSH_USER@$REDIS_SSH_HOST"
    else
      echo "AutoSSH already running."
    fi

    export REDIS_PORT=6380

    # Wait for tunnel to be established
    echo "Waiting for tunnel to be established..."
    while ! nc -z localhost $REDIS_PORT; do
      sleep 1
    done
    echo "Tunnel established."

    AUTOSSH_PID="$(cat /tmp/tunnel.pid)"
  fi
}

function shutdown() {
  echo "Caught sigterm, shutting down..."
  kill -TERM "$NODE_PID" 2>/dev/null
  wait "$NODE_PID"
  kill -TERM "$AUTOSSH_PID" 2>/dev/null
  wait "$AUTOSSH_PID"
  exit 0
}

function main() {
  init

  echo "Starting app..."
  exec node /app/main.js "$@" &
  NODE_PID=$!
  wait "$NODE_PID"
}

trap shutdown SIGINT SIGQUIT SIGTERM
main "$@"
