#!/bin/sh
# Input Hook exec target: colony-key.sh <linux-code> <dom-keyCode> [app-id]
# The hook swallows the key. When the colony overlay is on screen without
# remote focus (compact or critters) the key is handed to it as a relaunch parameter;
# otherwise the same key is written back to the remote's input device so the
# focused app (YouTube, or the colony's own menu) receives it unchanged.
APP=${3:-com.phil.roachcolony}
SM=luna://com.webos.surfacemanager
if luna-send -n 1 $SM/getForegroundWindowInfo '{}' | grep -q "\"$APP\"" &&
   ! luna-send -n 1 $SM/getFocusedWindowInfo '{}' | grep -q "\"$APP\""; then
  exec luna-send -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$APP\",\"params\":{\"remoteKey\":$2}}" >/dev/null
fi
exec /usr/bin/python -c 'import os,struct,sys
f=os.open("/dev/input/event3",os.O_WRONLY)
for v in (1,0):os.write(f,struct.pack("llHHillHHi",0,0,1,int(sys.argv[1]),v,0,0,0,0,0))
' "$1"
