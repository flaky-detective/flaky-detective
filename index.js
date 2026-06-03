#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const testPattern = process.argv[2];
const runs = parseInt(process.argv[3]) || 10;

if (!testPattern) {
  console.log('Usage: node index.js <test-pattern> [runs]');
  console.log('Example: node index.js "tests/login.spec.ts" 10');
  process.exit(1);
}

const results = [];
console.log(`Running ${testPattern} ${runs} times...\n`);

for (let i = 1; i <= runs; i++) {
  try {
    execSync(`npx playwright test ${testPattern} --reporter=line`, { stdio: 'pipe', timeout: 300000 });
    results.push({ run: i, status: 'passed' });
    process.stdout.write('✓');
  } catch (e) {
    let error = e.stderr?.toString() || e.stdout?.toString() || e.message || 'Unknown';
    error = error.slice(0, 300);
    results.push({ run: i, status: 'failed', error });
    process.stdout.write('✗');
  }
}

const passed = results.filter(r => r.status === 'passed').length;
const failed = results.filter(r => r.status === 'failed').length;
const isFlaky = passed > 0 && failed > 0;

console.log(`\n\n${passed}/${runs} passed`);
console.log(isFlaky ? 'FLAKY' : 'STABLE');

function classifyError(error) {
  const text = (error || '').toLowerCase();
  if (text.includes('timeout') || text.includes('timed out')) return 'TIMING_ASYNC';
  if (text.includes('strict mode violation')) return 'SELECTOR_FRAGILITY';
  if (text.includes('expect') && (text.includes('tobe') || text.includes('toEqual'))) return 'ASSERTION_FAILURE';
  if (text.includes('net::') || text.includes('failed to fetch')) return 'NETWORK_EXTERNAL';
  if (text.includes('execution context') || text.includes('frame detached')) return 'ENVIRONMENT';
  if (text.includes('target closed') || text.includes('browser closed')) return 'ENVIRONMENT';
  if (text.includes('page crashed')) return 'ENVIRONMENT';
  if (text.includes('cookies') || text.includes('localstorage')) return 'DATA_POLLUTION';
  return 'UNKNOWN';
}

const FIXES = {
  TIMING_ASYNC: 'Add explicit waits: await expect(locator).toBeVisible() before clicking.',
  SELECTOR_FRAGILITY: 'Use getByTestId() or getByRole() instead of fragile CSS selectors.',
  ASSERTION_FAILURE: 'Check test data determinism and isolation.',
  NETWORK_EXTERNAL: 'Mock external APIs with page.route().',
  ENVIRONMENT: 'Ensure page is fully loaded and contexts are stable.',
  DATA_POLLUTION: 'Clear storage in beforeEach: await context.clearCookies(); await page.evaluate(() => localStorage.clear());',
  UNKNOWN: 'Review error logs manually. Add screenshots/video to Playwright config.'
};

function generateQuarantineConfig(testPattern, classification) {
  const testName = path.basename(testPattern, path.extname(testPattern));
  return `# Auto-generated quarantine config for: ${testPattern}
# Classification: ${classification}
# Copy to .github/workflows/quarantine-${testName}.yml

name: Quarantined Test - ${testName}
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  quarantine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run quarantined test
        run: npx playwright test ${testPattern}
        continue-on-error: true
`;
}

if (isFlaky) {
  const failures = results.filter(r => r.status === 'failed');
  const classifications = {};
  failures.forEach(f => {
    const cls = classifyError(f.error);
    classifications[cls] = (classifications[cls] || 0) + 1;
  });
  const topClass = Object.entries(classifications).sort((a,b) => b[1] - a[1])[0][0];
  console.log(`\nMost common failure: ${topClass}`);
  console.log(`Fix: ${FIXES[topClass] || FIXES.UNKNOWN}`);
  console.log('\n--- Quarantine Config ---');
  console.log(generateQuarantineConfig(testPattern, topClass));
  console.log('--- Copy the above to .github/workflows/ ---\n');
}

const report = { testPattern, runs, passed, failed, isFlaky, results };
fs.writeFileSync('flaky-report.json', JSON.stringify(report, null, 2));
console.log('Report saved to flaky-report.json');