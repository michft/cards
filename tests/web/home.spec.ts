import { expect, test } from '@playwright/test';

test('home screen shows the primary menu', async ({ page }) => {
  page.on('console', (message) => {
    console.log(`browser:${message.type()}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    console.log(`pageerror:${error.message}`);
  });

  await page.goto('/');
  await page.waitForTimeout(1000);

  await expect(page.getByText("Mum's Cards")).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
  await expect(page.getByText('Rules')).toBeVisible();
});
