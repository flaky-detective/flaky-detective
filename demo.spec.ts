import { test, expect } from '@playwright/test';

test('randomly flaky', async () => {
  if (Math.random() > 0.6) {
    throw new Error('Simulated flaky failure');
  }
  await expect(true).toBe(true);
});