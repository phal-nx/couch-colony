#!/usr/bin/env python3
"""Inspect the TV, or explicitly run an approved overlay experiment.

inspect performs only read queries. install and test require a separate flag.
Nothing changes Home, remote key bindings, startup hooks, or system services.
"""
import argparse
import json
import os
import re
import shlex
import socket
import subprocess
import time
from pathlib import Path

APP_ID = 'com.phil.roachcolony'
# The TV is reached through an `lgtv` SSH host alias; telnet goes to the same address.
HOST = os.environ.get('ROACH_TV_HOST') or re.search(r'^hostname (\S+)$', subprocess.run(['ssh', '-G', 'lgtv'], capture_output=True, text=True).stdout, re.M).group(1)


def strip_telnet(data):
    # This TV emits option negotiation at connect; all command output is text.
    return re.sub(rb'\xff[\xfb-\xfe].', b'', data).replace(b'\xff\xff', b'\xff').replace(b'\r', b'')


def root_command(command, timeout=15):
    marker = '__ROACH_COMMAND_FINISHED__'
    with socket.create_connection((HOST, 23), timeout=5) as connection:
        connection.settimeout(.3)
        time.sleep(.15)
        try:
            connection.recv(8192)
        except socket.timeout:
            pass
        connection.sendall((command + '\necho ' + marker + '\n').encode())
        output = b''
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                chunk = connection.recv(65536)
                if not chunk:
                    break
                output += chunk
                clean = strip_telnet(output)
                if re.search(rb'(?m)^' + marker.encode() + rb'\s*$', clean):
                    return clean.decode(errors='replace')
            except socket.timeout:
                continue
        raise TimeoutError('TV root command did not finish: ' + strip_telnet(output).decode(errors='replace')[-3000:])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inspect', 'install', 'test', 'close'])
    parser.add_argument('--playback-test-approved', action='store_true')
    args = parser.parse_args()
    if args.action != 'inspect' and not args.playback_test_approved:
        parser.error('Stop: ask whoever is watching before any installation, launch, or close. After permission, add --playback-test-approved.')
    if args.action == 'inspect':
        print(root_command("luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}'\nfree\nuname -a\ncommand -v nohup"))
    elif args.action == 'install':
        project = Path(__file__).resolve().parents[2]
        version = json.loads((project / 'app' / 'appinfo.json').read_text())['version']
        filename = APP_ID + '_' + version + '_all.ipk'
        package = project / 'dist' / filename
        subprocess.run(['scp', str(package), 'lgtv:/media/developer/temp/roach-colony.ipk'], check=True)
        payload = json.dumps({'id': APP_ID, 'ipkUrl': '/media/developer/temp/roach-colony.ipk', 'subscribe': True}, separators=(',', ':'))
        result = root_command("luna-send -w 25000 -n 40 -f luna://com.webos.appInstallService/dev/install '" + payload + "'", timeout=35)
        print(result)
        if not re.search(r'"state"\s*:\s*"installed"', result):
            raise RuntimeError('TV did not confirm the installed state. Do not launch.')
    elif args.action == 'test':
        # Arm a root-side close before launching; it survives this client exiting.
        # It targets only this new app and never relaunches YouTube or Home.
        close_payload = json.dumps({'id': APP_ID}, separators=(',', ':'))
        watchdog = 'sleep 25; luna-send -n 1 luna://com.webos.applicationManager/close ' + shlex.quote(close_payload)
        command = 'nohup sh -c ' + shlex.quote(watchdog) + ' >/tmp/roach-colony-watchdog.log 2>&1 </dev/null &\nROACH_WATCHDOG_PID=$!\nsleep 1\nif kill -0 "$ROACH_WATCHDOG_PID" 2>/dev/null; then echo ROACH_WATCHDOG_READY; else echo ROACH_WATCHDOG_FAILED; fi'
        armed = root_command(command)
        print(armed)
        if not re.search(r'(?m)^ROACH_WATCHDOG_READY\s*$', armed):
            raise RuntimeError('The independent close watchdog did not start. Do not launch.')
        payload = json.dumps({'id': APP_ID, 'params': {'autoCloseSeconds': 20, 'corner': 'bottom-right', 'compact': True}}, separators=(',', ':'))
        print(root_command("luna-send -n 1 -f luna://com.webos.applicationManager/launch '" + payload + "'"))
        # Check that no underlying app was evicted; visible video and remote
        # focus still need a report from someone at the screen.
        time.sleep(2)
        print(root_command("luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}'\nluna-send -n 1 -f luna://com.webos.applicationManager/running '{}'"))
    elif args.action == 'close':
        print(root_command("luna-send -n 1 -f luna://com.webos.applicationManager/close '{\"id\":\"" + APP_ID + "\"}'"))


if __name__ == '__main__':
    main()
