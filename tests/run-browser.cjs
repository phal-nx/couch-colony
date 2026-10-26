const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = path.resolve(__dirname, '../app');
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json'};
const server = http.createServer((request, response) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/app/')) { response.writeHead(404).end(); return; }
    file = path.resolve(root, pathname.slice(5) || 'index.html');
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  } catch {
    response.writeHead(400).end(); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    response.end(data);
  });
});

// Suites run one after another against the same server; naming files on the command line runs only those.
const suites = process.argv.length > 2 ? process.argv.slice(2) : ['tests/browser.cjs', 'tests/ui-moments.cjs', 'tests/menu-overflow.cjs', 'tests/reset-progress.cjs', 'tests/ui-stress.cjs', 'tests/census-fit.cjs', 'tests/opening.cjs', 'tests/hint.cjs'];
server.listen(0, '127.0.0.1', () => {
  const next = index => {
    if (index === suites.length) { server.close(); return; }
    const child = spawn(process.execPath, [path.resolve(__dirname, '..', suites[index])], {
      cwd:path.resolve(__dirname, '..'), stdio:'inherit',
      env:{...process.env, ROACH_PREVIEW_URL:`http://127.0.0.1:${server.address().port}/app/`}
    });
    child.on('error', error => {
      console.error('[ROACH] browser test: failed to start test process.', error);
      process.exitCode = 1; server.close();
    });
    child.on('exit', code => {
      if (code !== 0) { process.exitCode = code === null ? 1 : code; server.close(); return; }
      next(index + 1);
    });
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { child.kill(signal); server.close(); });
  };
  next(0);
});
