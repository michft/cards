import { expect, test, type Locator } from '@playwright/test';

test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });

async function contrast(locator: Locator) {
  return locator.evaluate((node) => {
    const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const over = (foreground: number[], background: number[]) => {
      const alpha = foreground[3] ?? 1;
      return foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
    };
    const ancestors: Element[] = [];
    for (let current: Element | null = node; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255];
    for (const ancestor of ancestors) background = over(rgba(getComputedStyle(ancestor).backgroundColor), background);
    const foreground = over(rgba(getComputedStyle(node).color), background);
    const luminance = (rgb: number[]) => rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
}

test('table labels remain readable while suits stay dark on cream card faces', async ({ page }, testInfo) => {
  await page.goto('/game/spider?mode=new');
  await expect(page).toHaveURL(/mode=resume$/);
  for (const text of [/^Spider \(/, /^Stock: /, /^Runs complete: /, /^K$/]) {
    const label = page.getByText(text).first();
    await expect(label).toBeVisible();
    expect(await contrast(label), String(text)).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({ path: testInfo.outputPath('spider-colours.png') });
  await page.goto('/game/freecell?mode=new');
  await expect(page).toHaveURL(/mode=resume$/);
  expect(await contrast(page.getByText('Free', { exact: true }).first())).toBeGreaterThanOrEqual(4.5);
  for (const suit of ['♠', '♥']) {
    const rank = page.getByRole('button', { name: new RegExp(`^[AKQJ0-9]+ ${suit} ${suit} ${suit}$`) })
      .first().locator('[dir="auto"]').first();
    expect(await contrast(rank)).toBeGreaterThanOrEqual(4.5);
    const colour = await rank.evaluate((node) => getComputedStyle(node).color);
    expect(colour).toBe(suit === '♠' ? 'rgb(23, 33, 41)' : 'rgb(186, 59, 48)');
  }
});

test('storage failure and retry text are readable on their surfaces', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key: string) {
      if (key === 'mumscards.saves') throw new Error('Storage unavailable');
      return original.call(this, key);
    };
  });
  await page.goto('/game/freecell?mode=resume');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Saved games could not be read');
  expect(await contrast(alert)).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.getByText('Retry storage', { exact: true }))).toBeGreaterThanOrEqual(4.5);
});

test('disabled controls keep readable labels on solid muted surfaces', async ({ page }) => {
  for (const game of ['clock', 'freecell', 'klondike', 'pyramid', 'spider']) {
    await page.goto(`/game/${game}?mode=new`);
    await expect(page).toHaveURL(/mode=resume$/);
    for (const name of ['Undo', 'Redo']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS('opacity', '1');
      await expect(button).toHaveCSS('background-color', 'rgb(228, 220, 205)');
      expect(await contrast(button.getByText(name, { exact: true }))).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.goto('/settings');
  const exportButton = page.getByRole('button', { name: 'Export training log', exact: true });
  await expect(exportButton).toBeDisabled();
  await expect(exportButton).toHaveCSS('opacity', '1');
  expect(await contrast(exportButton.getByText('Export training log', { exact: true }))).toBeGreaterThanOrEqual(4.5);
});
