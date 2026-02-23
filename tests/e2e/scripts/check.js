#!/usr/bin/env node

const http = require('http');

const servers = [
  { name: 'E2E dev server (6100)', url: 'http://localhost:6100/bundle-version' },
  { name: 'Flight server (6000)', url: 'http://localhost:6000/bundle-version' },
  { name: 'SSR server (6001)', url: 'http://localhost:6001/healthz' },
];

function check(url) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 3000 }, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const maxNameLen = Math.max(...servers.map(s => s.name.length));
  let allOk = true;

  for (const server of servers) {
    const ok = await check(server.url);
    const pad = ' '.repeat(maxNameLen - server.name.length);
    console.log(`${server.name}: ${pad}${ok ? 'OK' : 'FAIL'}`);
    if (!ok) allOk = false;
  }

  process.exit(allOk ? 0 : 1);
}

main();
