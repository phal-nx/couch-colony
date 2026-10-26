#!/bin/sh
# Called only by a physical Blue key-down through the existing Input Hook.
# The app treats remoteToggle as open on first launch and close on relaunch.
# When the phone controller bridge is running, its per-boot key lets the game connect.
mkdir /tmp/roach-colony-blue.lock 2>/dev/null || exit 0
trap 'rmdir /tmp/roach-colony-blue.lock' EXIT INT TERM
KEY=$(cat /tmp/roach-colony-controller/game-key 2>/dev/null | tr -cd 0-9a-f)
EXTRA=''
[ ${#KEY} -eq 64 ] && EXTRA=',"controllerKey":"'"$KEY"'"'
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.phil.roachcolony","params":{"remoteToggle":true,"compact":true,"corner":"bottom-right","autoCloseSeconds":0'"$EXTRA"'}}' >>/tmp/roach-colony-blue.log 2>&1
sleep 1
