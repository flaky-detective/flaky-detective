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

console.log(`\n\n${passed}/${runs} passed`);
console.log(isFlaky ? 'FLAKY: Test shows inconsistent behavior' : 'STABLE: Test is consistent');

fs.writeFileSync('flaky-report.json', JSON.stringify({
  testPattern, runs, passed, failed, isFlaky, results
}, null, 2));
console.log('Report saved to flaky-report.json');