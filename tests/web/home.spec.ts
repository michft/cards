import { expect, test } from '@playwright/test';

test('new game and continue flows work from home', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText("Mum's Cards")).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
  await expect(page.getByText('Rules')).toBeVisible();

  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByText('Stock')).toBeVisible();
  await expect(page.getByText('Waste')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Stock')).toBeVisible();
});
