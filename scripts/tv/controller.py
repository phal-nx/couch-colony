#!/usr/bin/env python3
"""Install, inspect or roll back the phone controller bridge on the TV.

status performs only read queries. install and rollback require --approved.
Neither launches or closes the game, reboots, restarts Home, or touches the
game's saves or the one-time reset receipt (those live in the app's storage).
"""
import argparse
import io
import re
import subprocess
import tarfile
from pathlib import Path

from tv import root_command

PROJECT = Path(__file__).resolve().parents[2]
BASE = '/var/lib/webosbrew/roach-colony'
TARGET = BASE + '/controller'
INIT = '/var/lib/webosbrew/init.d/70-roach-colony-controller'
UPLOAD = '/media/developer/temp/roach-colony-controller.tgz'
SCRIPT = '/media/developer/temp/roach-colony-controller-install.sh'
FILES = {
    'bridge.js': 'phone-controller/bridge.js',
    'websocket.js': 'phone-controller/websocket.js',
    'run.sh': 'phone-controller/run.sh',
    'inputhook-watchdog.sh': 'phone-controller/inputhook-watchdog.sh',
    'config.env.example': 'phone-controller/config.env.example',
    'init.d/70-roach-colony-controller': 'phone-controller/init.d/70-roach-colony-controller',
    'public/index.html': 'phone-controller/public/index.html',
    'public/phone.js': 'phone-controller/public/phone.js',
    'public/phone.css': 'phone-controller/public/phone.css',
    'public/theme.js': 'app/theme.js',
    'public/manifest.webmanifest': 'phone-controller/public/manifest.webmanifest',
    'public/icons/apple-touch-icon.png': 'phone-controller/public/icons/apple-touch-icon.png',
    'public/icons/icon-192.png': 'phone-controller/public/icons/icon-192.png',
    'public/icons/icon-512.png': 'phone-controller/public/icons/icon-512.png',
    'public/fonts/atkinson-hyperlegible-400.woff2': 'phone-controller/public/fonts/atkinson-hyperlegible-400.woff2',
    'public/fonts/atkinson-hyperlegible-700.woff2': 'phone-controller/public/fonts/atkinson-hyperlegible-700.woff2',
    'public/fonts/bricolage-grotesque.woff2': 'phone-controller/public/fonts/bricolage-grotesque.woff2',
    'public/fonts/OFL-AtkinsonHyperlegible.txt': 'phone-controller/public/fonts/OFL-AtkinsonHyperlegible.txt',
    'public/fonts/OFL-BricolageGrotesque.txt': 'phone-controller/public/fonts/OFL-BricolageGrotesque.txt',
    'public/art/red_key_capsule.png': 'app/art/red_key_capsule.png',
    'blue-toggle.sh': 'scripts/tv/blue-toggle.sh',
}
# The phone's share of the menu art; the bridge serves the same list as /ui-art/<name>.png.
for _name in ('ui_border_9slice', 'tab_units', 'tab_upgrades', 'tab_more', 'qty_1', 'qty_10', 'qty_max',
              'progress_cap_left', 'progress_cap_right', 'progress_segment_full', 'progress_segment_empty',
              'status_play', 'status_pause', 'status_wait', 'status_stop', 'status_pin', 'status_goal',
              'status_inspect', 'status_history', 'status_expedition', 'status_choice', 'status_reserve',
              'status_guide', 'capsule_red', 'capsule_green', 'capsule_yellow', 'capsule_blue'):
    FILES[f'public/ui-art/{_name}.png'] = f'app/ui-art/{_name}.png'


def bundle():
    output = PROJECT / 'dist' / 'roach-colony-controller.tgz'
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, source in FILES.items():
            data = (PROJECT / source).read_bytes()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name.endswith('.sh') or name.startswith('init.d/') else 0o644
            archive.addfile(info, io.BytesIO(data))
    return output


def status():
    return root_command(
        f'[ -x {TARGET}/run.sh ] && {TARGET}/run.sh status || echo "roach-controller: not installed"\n'
        f'ls -l {INIT} 2>/dev/null || echo "roach-controller: no boot script"\n'
        'tail -n 15 /tmp/roach-colony-controller/bridge.log 2>/dev/null\n'
        'tail -n 5 /tmp/roach-colony-controller/inputhook-watchdog.log 2>/dev/null', timeout=20)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['status', 'install', 'rollback'])
    parser.add_argument('--approved', action='store_true')
    args = parser.parse_args()
    if args.action != 'status' and not args.approved:
        parser.error('Stop: ask the TV owner before installing or removing the controller. After permission, add --approved.')
    if args.action == 'status':
        print(status())
    elif args.action == 'install':
        package = bundle()
        subprocess.run(['scp', str(package), 'lgtv:' + UPLOAD], check=True)
        # The previous Blue script is kept once so rollback can restore it exactly. The steps go up
        # as a script because the TV's shell truncates long single-line commands.
        steps = '\n'.join([
            'set -e',
            f'mkdir -p {TARGET}/data',
            f'chmod 700 {TARGET}/data',
            f'tar xzf {UPLOAD} -C {TARGET} 2>/dev/null',
            f'chmod 755 {TARGET}/run.sh {TARGET}/init.d/70-roach-colony-controller',
            f'[ -f {TARGET}/blue-toggle.before-controller.sh ] || cp -p {BASE}/blue-toggle.sh {TARGET}/blue-toggle.before-controller.sh',
            f'cp {TARGET}/blue-toggle.sh {BASE}/blue-toggle.sh.new',
            f'chmod 755 {BASE}/blue-toggle.sh.new',
            f'mv -f {BASE}/blue-toggle.sh.new {BASE}/blue-toggle.sh',
            f'cp {TARGET}/init.d/70-roach-colony-controller {INIT}',
            f'chmod 755 {INIT}',
            f'rm -f {UPLOAD}',
            f'{TARGET}/run.sh restart',
            'echo ROACH_CONTROLLER_INSTALLED',
        ]) + '\n'
        script = Path(__file__).resolve().parents[2] / 'dist' / 'roach-colony-controller-install.sh'
        script.write_text(steps)
        subprocess.run(['scp', str(script), 'lgtv:' + SCRIPT], check=True)
        result = root_command(f'sh {SCRIPT}; rm -f {SCRIPT}', timeout=30)
        print(result)
        if not re.search(r'(?m)^ROACH_CONTROLLER_INSTALLED\s*$', result):
            raise RuntimeError('The controller install did not finish. Run status before retrying.')
        print(status())
    else:
        result = root_command(
            f'[ -x {TARGET}/run.sh ] && {TARGET}/run.sh stop\n'
            f'rm -f {INIT}\n'
            f'[ -f {TARGET}/blue-toggle.before-controller.sh ] && cp -p {TARGET}/blue-toggle.before-controller.sh {BASE}/blue-toggle.sh\n'
            f'rm -rf {TARGET} /tmp/roach-colony-controller\n'
            f'[ -e {TARGET} ] || [ -e {INIT} ] || echo ROACH_CONTROLLER_REMOVED', timeout=30)
        print(result)
        if not re.search(r'(?m)^ROACH_CONTROLLER_REMOVED\s*$', result):
            raise RuntimeError('The controller rollback did not finish. Run status.')


if __name__ == '__main__':
    main()
