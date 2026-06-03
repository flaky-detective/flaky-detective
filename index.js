#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function classifyError(error) {
  const text = (error || '').toLowerCase();
  if (text.includes('strict mode violation') || text.includes('resolved to')) return 'SELECTOR_FRAGILITY';
  if (text.includes('timeout') && text.includes('locator')) return 'TIMING_ASYNC';
  if (text.includes('expect') && text.includes('tobe')) return 'ASSERTION_FAILURE';
  if (text.includes('net::') || text.includes('failed to fetch') || text.includes('err_')) return 'NETWORK_EXTERNAL';
  if (text.includes('execution context') || text.includes('frame detached')) return 'ENVIRONMENT';
  return 'UNKNOWN';
}

const FIXES = {
  SELECTOR_FRAGILITY: 'Use getByTestId() or getByRole() instead of CSS selectors. Ensure data-testid attributes are unique.',
  TIMING_ASYNC: 'Add explicit waits: await expect(locator).toBeVisible() before clicking. Avoid fixed timeouts.',
  ASSERTION_FAILURE: 'Check if test data is deterministic. Use isolated test accounts or reset state in beforeEach.',
  NETWORK_EXTERNAL: 'Mock external APIs with page.route() or use a test-specific API endpoint.',
  ENVIRONMENT: 'Ensure page is fully loaded. Check for iframe context switches or shadow DOM.',
  UNKNOWN: 'Review error logs manually. Add screenshots and video to Playwright config for debugging.'
};

function generateQuarantineConfig(testPattern, classification) {
  const testName = path.basename(testPattern, path.extname(testPattern));
  return `# Auto-generated quarantine config for: ${testPattern}
# Classification: ${classification}
# Copy to .github/workflows/quarantine-${testName}.yml

name: Quarantined Test - ${testName}
on:
  schedule:
    - cron: '0 2 * * *'  # Run nightly at 2 AM
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

const testPattern = process.argv[2];
const runs = parseInt(process.argv[3]) || 10;

if (!testPattern) {
  console.log('Usage: node index.js <test-pattern> [runs]');
  console.log('Example: node index.js "tests/login.spec.ts" 10');
  process.exit(1);
}

const results = [];
const tmpDir = './flaky-tmp-' + Date.now();

console.log(`Running ${testPattern} ${runs} times...\n`);

for (let i = 1; i <= runs; i++) {
  try {
    execSync(`npx playwright test ${testPattern} --reporter=json --output=${tmpDir}`, {
      stdio: 'pipe',
      timeout: 300000,
      env: { ...process.env, PW_TEST_HTML_REPORT_OPEN: 'never' }
    });
    results.push({ run: i, status: 'passed' });
    process.stdout.write('✓');
  } catch (e) {
    let error = 'Unknown';
    const reportPath = path.join(tmpDir, 'report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const failedSuite = report.suites?.find(s => s.specs?.some(sp => !sp.ok));
        const failedSpec = failedSuite?.specs?.find(sp => !sp.ok);
        error = failedSpec?.tests?.[0]?.results?.[0]?.error?.message || 'Unknown';
      } catch (parseErr) {
        error = 'Parse error: ' + parseErr.message;
      }
    }
    results.push({ run: i, status: 'failed', error: error.slice(0, 300) });
    process.stdout.write('✗');
  }
}

// Cleanup
if (fs.existsSync(tmpDir)) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const passed = results.filter(r => r.status === 'passed').length;
const failed = results.filter(r => r.status === 'failed').length;
const isFlaky = passed > 0 && failed > 0;

if (isFlaky) {
  const failures = results.filter(r => r.status === 'failed');
  const classifications = {};
  failures.forEach(f => {
    const cls = classifyError(f.error);
    classifications[cls] = (classifications[cls] || 0) + 1;
  });
  const topClass = Object.entries(classifications).sort((a,b) => b[1] - a[1])[0][0];
  console.log(`\nMost common failure: ${topClass}`);
  console.log(`Fix: ${FIXES[topClass]}`);
  console.log('\n--- Quarantine Config ---');
  console.log(generateQuarantineConfig(testPattern, topClass));
  console.log('--- Copy the above to .github/workflows/ to run this test non-blocking ---\n');

  // Also save to JSON
  const finalReport = JSON.parse(fs.readFileSync('flaky-report.json', 'utf8'));
  finalReport.classification = topClass;
  finalReport.suggestion = FIXES[topClass];
  finalReport.quarantineConfig = generateQuarantineConfig(testPattern, topClass);
  fs.writeFileSync('flaky-report.json', JSON.stringify(finalReport, null, 2));
}

console.log(`\n\n${passed}/${runs} passed`);
console.log(isFlaky ? 'FLAKY: Test shows inconsistent behavior' : 'STABLE: Test is consistent');

fs.writeFileSync('flaky-report.json', JSON.stringify({
  testPattern, runs, passed, failed, isFlaky, results
}, null, 2));
console.log('Report saved to flaky-report.json');