#!/usr/bin/env node

const http = require('http');

const RESULTS_BASE = 'http://localhost:6101';
const POLL_INTERVAL = 2000;
const TIMEOUT = 120000;

function httpRequest(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout: 5000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${url}: ${data}`));
        }
      });
    });
    req.on('error', err => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

function pollResults(fixtureName, startTime) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startTime > TIMEOUT) {
        reject(new Error('Timed out waiting for results after 120 seconds'));
        return;
      }

      try {
        const results = await httpRequest('GET', `${RESULTS_BASE}/results`);

        if (results.status === 'complete') {
          resolve(results);
          return;
        }

        // For single fixture, check if that fixture has results even if overall still running
        if (fixtureName && results.fixtures && results.fixtures[fixtureName]) {
          const f = results.fixtures[fixtureName];
          if (f.passed !== undefined) {
            // Check if total is still incrementing or if it's done
            // We need to wait for complete status to ensure the fixture result is final
          }
        }
      } catch {
        // Server might not be responding yet, keep polling
      }

      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
  });
}

function printAllResults(results) {
  const fixtures = results.fixtures || {};
  const entries = Object.entries(fixtures);
  const total = entries.length;
  const passing = entries.filter(([, f]) => f.passed).length;
  const failing = entries.filter(([, f]) => !f.passed);

  console.log(`LayoutCompare: ${passing}/${total} passing, ${total - passing} failing`);

  if (failing.length > 0) {
    console.log('\nFailing:');
    failing
      .sort((a, b) => b[1].diffs.length - a[1].diffs.length)
      .forEach(([name, f]) => {
        const diffCount = f.error ? 'error' : `${f.diffs.length} diffs`;
        console.log(`  ${name.padEnd(30)} ${diffCount}`);
      });
  }

  const passingNames = entries.filter(([, f]) => f.passed).map(([name]) => name);
  if (passingNames.length > 0) {
    console.log('\nPassing:');
    console.log(`  ${passingNames.join(', ')}`);
  }

  process.exit(failing.length > 0 ? 1 : 0);
}

function printSingleResult(fixtureName, results) {
  const fixtures = results.fixtures || {};
  const f = fixtures[fixtureName];

  if (!f) {
    console.error(`Fixture '${fixtureName}' not found in results`);
    process.exit(1);
  }

  if (f.error) {
    console.log(`LayoutCompare: ${fixtureName} — ERROR (${f.error})`);
    process.exit(1);
  }

  const diffCount = f.diffs.length;
  const status = f.passed ? 'PASS' : 'FAIL';
  console.log(`LayoutCompare: ${fixtureName} — ${status} (${diffCount} diffs)`);

  if (!f.passed && f.diffs.length > 0) {
    console.log('\nDiffs:');
    f.diffs.forEach(d => {
      const path = (d.path || '').padEnd(25);
      const prop = (d.property || '').padEnd(10);
      console.log(`  ${path} ${prop} web=${d.web}  native=${d.native}  delta=${d.delta}`);
    });
  }

  process.exit(f.passed ? 0 : 1);
}

async function main() {
  const fixtureName = process.argv[2] || null;

  // Trigger the test run
  const endpoint = fixtureName
    ? `${RESULTS_BASE}/run/${fixtureName}`
    : `${RESULTS_BASE}/run-all`;

  try {
    await httpRequest('POST', endpoint);
  } catch {
    console.error('LayoutCompare app not running. Build and launch it first.');
    process.exit(1);
  }

  // Poll for results
  const startTime = Date.now();
  let results;
  try {
    results = await pollResults(fixtureName, startTime);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // Print results
  if (fixtureName) {
    printSingleResult(fixtureName, results);
  } else {
    printAllResults(results);
  }
}

main();
