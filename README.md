# Flaky Test Detective

Run Playwright tests repeatedly to detect flakiness.  
If flaky, generates a GitHub Actions workflow to quarantine the test (run nightly, non‑blocking).

## Usage

```bash
npx flaky-detective "tests/login.spec.ts" 10
```

- Run npx flaky-detective

- First argument = test file pattern (e.g., "tests/login.spec.ts")

- Second argument = number of runs (default 10 if omitted)

## Example

Running tests/login.spec.ts 10 times...
✓✗✓✗✓✓✗✓✓✗

6/10 passed
FLAKY

--- Quarantine Config ---
# Copy to .github/workflows/quarantine.yml
name: Quarantined Test
on:
  schedule:
    - cron: '0 2 * * *'
jobs:
  quarantine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/login.spec.ts
        continue-on-error: true

--- NOTE: The YAML uses the exact test path you provided. In this example, it's tests/login.spec.ts.---

## Quarantine step‑by‑step
1. Run the CLI. If flaky, copy the YAML block from --- Quarantine Config ---.

2. In your repository, create the folder .github/workflows/ (if it doesn't exist).

3. Save the YAML as quarantine-[test-name].yml.

4. Commit and push. GitHub will run the test nightly at 2 AM with continue-on-error: true.

## What it does

1. Runs your test N times

2. Detects flakiness (inconsistent pass/fail)

3. Prints a YAML file you can copy into .github/workflows/ to move the test to a nightly, non‑blocking job

## What it does NOT do

- Automatically fix flaky tests

- Reliably classify root causes (we try keyword matching, but often return "unknown")

- Rewrite imports or handle nested test paths (the YAML assumes the test file is in the root)

## License

MIT

## Links

- https://github.com/flaky-detective/flaky-detective
- https://github.com/flaky-detective/flaky-detective/issues

