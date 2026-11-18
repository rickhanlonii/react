// Mount time and retained heap per row, for comparing React builds. Same
// measurement as run.mjs --memory, alternating the dists, several repeats.
//
//   node mem.mjs --dists=dist-base,dist-opt --variants=store,context --n=1000,10000

import {chromium} from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
const dists = option('dists', 'dist-base,dist-opt').split(',');
const variants = option('variants', 'store,store-single,context,zustand').split(
  ',',
);
const nList = option('n', '1000,10000').split(',').map(Number);
const repeats = Number(option('repeats', 3));
const compiler = option('compiler', 'on') === 'on';
const browserPath = process.env.BENCH_BROWSER || null;
const singleProcess = process.env.BENCH_SINGLE_PROCESS === '1';

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(here, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(here) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.html')
        ? 'text/html'
        : 'application/javascript',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(port, dist, variant, n) {
  const browser = await chromium.launch({
    executablePath: browserPath || undefined,
    channel: browserPath ? undefined : 'chrome',
    args: [
      '--js-flags=--expose-gc',
      ...(singleProcess
        ? ['--single-process', '--no-zygote', '--disable-gpu']
        : []),
    ],
  });
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  const file = `${variant}-${compiler ? 'compiler' : 'nocompiler'}.html`;
  await page.goto(`http://localhost:${port}/${dist}/${file}`);
  await page.waitForFunction(() => window.__bench !== undefined);
  async function heap() {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  }
  const before = await heap();
  const mountMs = await page.evaluate(
    count => window.__bench.mount(count, 'entity'),
    n,
  );
  const after = await heap();
  await browser.close();
  return {mountMs, bytesPerRow: (after - before) / n};
}

const server = await serve();
const port = server.address().port;
const results = new Map();
for (let r = 0; r < repeats; r++) {
  for (const n of nList) {
    for (const variant of variants) {
      const order = r % 2 === 0 ? dists : [...dists].reverse();
      for (const dist of order) {
        const key = `${variant} N=${n}|${dist}`;
        if (!results.has(key)) {
          results.set(key, []);
        }
        results.get(key).push(await measure(port, dist, variant, n));
      }
    }
  }
  process.stderr.write(`repeat ${r + 1}/${repeats}\n`);
}
server.close();

console.log(
  '\n' +
    'config'.padEnd(24) +
    dists.map(d => `${d} bytes/row`.padStart(22)).join('') +
    dists.map(d => `${d} mount ms`.padStart(22)).join(''),
);
for (const n of nList) {
  for (const variant of variants) {
    const name = `${variant} N=${n}`;
    const rows = dists.map(d => results.get(`${name}|${d}`));
    console.log(
      name.padEnd(24) +
        rows
          .map(x => median(x.map(y => y.bytesPerRow)).toFixed(0).padStart(22))
          .join('') +
        rows
          .map(x => median(x.map(y => y.mountMs)).toFixed(1).padStart(22))
          .join(''),
    );
  }
}
