#!/bin/sh
# Starts, stops and supervises the Couch Colony phone controller bridge on the TV.
# Runs as root from webosbrew init.d; never touches the game, its saves or Home.
DIR=$(cd "$(dirname "$0")" && pwd)
RUN=${ROACH_CONTROLLER_RUN:-/tmp/roach-colony-controller}
LOG=$RUN/bridge.log
NODE=${ROACH_CONTROLLER_NODE:-/usr/bin/node}
[ -f "$DIR/config.env" ] && . "$DIR/config.env"
ROACH_CONTROLLER_KEY_FILE=$RUN/game-key
export ROACH_CONTROLLER_PORT ROACH_CONTROLLER_GAME_PORT ROACH_CONTROLLER_KEY_FILE

running() { [ -f "$RUN/supervisor.pid" ] && kill -0 "$(cat "$RUN/supervisor.pid")" 2>/dev/null; }
cap_log() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 262144 ]; then mv -f "$LOG" "$LOG.1"; fi
}

case "$1" in
  start)
    if running; then echo "roach-controller: already running"; exit 0; fi
    mkdir -p "$RUN" && chmod 700 "$RUN"
    rm -f "$RUN/stopping"
    nohup sh "$DIR/run.sh" supervise </dev/null >/dev/null 2>&1 &
    echo $! > "$RUN/supervisor.pid"
    nohup sh "$DIR/inputhook-watchdog.sh" </dev/null >/dev/null 2>&1 &
    echo $! > "$RUN/watchdog.pid"
    echo "roach-controller: started"
    ;;
  supervise)
    delay=2
    trap 'touch "$RUN/stopping"; [ -f "$RUN/bridge.pid" ] && kill "$(cat "$RUN/bridge.pid")" 2>/dev/null; exit 0' TERM INT
    while [ ! -f "$RUN/stopping" ]; do
      cap_log
      started=$(date +%s)
      # One phone needs little heap; these flags trade V8 speed for a much smaller footprint on the TV.
      "$NODE" --max-old-space-size=24 --max-semi-space-size=1 --optimize-for-size "$DIR/bridge.js" >> "$LOG" 2>&1 &
      child=$!
      echo "$child" > "$RUN/bridge.pid"
      while kill -0 "$child" 2>/dev/null; do sleep 5 & wait $!; cap_log; done
      [ -f "$RUN/stopping" ] && break
      # Restart quickly after a long healthy run, otherwise back off up to five minutes.
      if [ $(( $(date +%s) - started )) -gt 60 ]; then delay=2; else delay=$(( delay * 2 )); [ "$delay" -gt 300 ] && delay=300; fi
      echo "$(date) roach-controller: bridge exited; restarting in ${delay}s" >> "$LOG"
      sleep "$delay"
    done
    ;;
  stop)
    mkdir -p "$RUN"
    touch "$RUN/stopping"
    [ -f "$RUN/supervisor.pid" ] && kill "$(cat "$RUN/supervisor.pid")" 2>/dev/null
    [ -f "$RUN/bridge.pid" ] && kill "$(cat "$RUN/bridge.pid")" 2>/dev/null
    [ -f "$RUN/watchdog.pid" ] && kill "$(cat "$RUN/watchdog.pid")" 2>/dev/null
    sleep 1
    rm -f "$RUN/supervisor.pid" "$RUN/bridge.pid" "$RUN/watchdog.pid"
    echo "roach-controller: stopped"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    if running; then echo "roach-controller: supervisor $(cat "$RUN/supervisor.pid") bridge $(cat "$RUN/bridge.pid" 2>/dev/null) inputhook watchdog $(cat "$RUN/watchdog.pid" 2>/dev/null)"; else echo "roach-controller: not running"; fi
    HEALTH="http://127.0.0.1:${ROACH_CONTROLLER_PORT:-8642}/api/health"
    wget -q -O - "$HEALTH" 2>/dev/null || curl -fsS "$HEALTH" 2>/dev/null || echo "roach-controller: health endpoint not answering"
    echo
    ;;
  *)
    echo "usage: $0 start|stop|restart|status" >&2
    exit 2
    ;;
esac
