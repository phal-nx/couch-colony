#!/bin/sh
# Approval-gated deployment variant: install only for an explicitly approved fresh start.
# Requests the authorized fresh start once, on the first subsequent Blue launch.
# The app treats remoteToggle as open on first launch and close on relaunch.
mkdir /tmp/roach-colony-blue.lock 2>/dev/null || exit 0
trap 'rmdir /tmp/roach-colony-blue.lock' EXIT INT TERM
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.phil.roachcolony","params":{"remoteToggle":true,"compact":true,"corner":"bottom-right","autoCloseSeconds":0,"resetSaveToken":"fresh-start-0.3.0"}}' >>/tmp/roach-colony-blue.log 2>&1
sleep 1
