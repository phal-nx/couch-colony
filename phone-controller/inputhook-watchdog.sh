#!/bin/sh
# Re-injects the webosbrew Input Hook when lginput2 restarts without it, so Blue and the color keys keep
# working. The hook's own service injects only once at boot. Checks once a minute, waits one more minute
# after first seeing an unhooked process in case something else is injecting it, and tries each process once.
# Input Hook 1.4 injects PHP (libphp.so running lginput-hook.php); 1.5 injects libinputhookpp.so. The watchdog
# recognises either hook and re-injects whichever one is installed.
SERVICE=${ROACH_INPUTHOOK_SERVICE:-/media/developer/apps/usr/palm/services/org.webosbrew.inputhook.service}
RUN=${ROACH_CONTROLLER_RUN:-/tmp/roach-colony-controller}
LOG=$RUN/inputhook-watchdog.log

hooked() { grep -q -e libphp.so -e libinputhookpp.so "/proc/$1/maps" 2>/dev/null; }

check() {
  [ -x "$SERVICE/inputhook/ezinject" ] || return 0
  pid=$(pidof lginput2) || return 0
  case "$pid" in *' '*) return 0 ;; esac
  if hooked "$pid"; then rm -f "$RUN/inputhook.seen"; return 0; fi
  [ "$(cat "$RUN/inputhook.tried" 2>/dev/null)" = "$pid" ] && return 0
  if [ "$(cat "$RUN/inputhook.seen" 2>/dev/null)" != "$pid" ]; then echo "$pid" > "$RUN/inputhook.seen"; return 0; fi
  echo "$pid" > "$RUN/inputhook.tried"
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 65536 ]; then mv -f "$LOG" "$LOG.1"; fi
  echo "$(date) lginput2 $pid lost the Input Hook; re-injecting" >> "$LOG"
  if [ -f "$SERVICE/inputhook/libinputhookpp.so" ]; then
    : > /tmp/lginput-hook-lginput2.log
    (cd "$SERVICE" && ./inputhook/ezinject -l /tmp/lginput-hook-lginput2.log "$pid" "$SERVICE/inputhook/libinputhookpp.so") >> "$LOG" 2>&1
  else
    if [ -f /usr/lib/libcrypt.so.2 ]; then lib=2; else lib=1; fi
    (cd "$SERVICE" && ./inputhook/ezinject "$pid" "$SERVICE/inputhook/libcrypt$lib/libphp.so" "$SERVICE/inputhook/lginput-hook.php" lginput2) >> "$LOG" 2>&1
  fi
  sleep 2
  if hooked "$pid"; then echo "$(date) re-injected" >> "$LOG"; else echo "$(date) re-inject failed" >> "$LOG"; fi
}

case "$1" in
  once) mkdir -p "$RUN"; check ;;
  *)
    mkdir -p "$RUN"
    while [ ! -f "$RUN/stopping" ]; do check; sleep 60 & wait $!; done
    ;;
esac
