import { test, expect } from '@playwright/test';

test('forced timeout flaky', async ({ page }) => {
  await page.goto('https://example.com');
  // Randomly choose to pass or fail with a timeout
  const shouldTimeout = Math.random() < 0.5;
  if (shouldTimeout) {
    // This will always timeout because #missing does not exist
    await page.locator('#missing').waitFor({ timeout: 1000 });
  } else {
    // This always passes
    await page.locator('h1').waitFor();
  }
  expect(true).toBe(true);
});