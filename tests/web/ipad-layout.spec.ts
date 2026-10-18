import { expect, test } from '@playwright/test';

const games = ['Clock', 'FreeCell', 'Klondike', 'Pyramid', 'Spider'] as const;

for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
  test.describe(`11-inch iPad ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('home previews and Continue fit the iPad', async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: "Mum's Cards" })).toBeVisible();
      for (const game of games) {
        const tile = page.getByRole('button', { name: `New ${game}`, exact: true });
        await expect(tile).toBeInViewport();
        const box = await tile.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(240);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      await expect(page.getByRole('button', { name: 'Continue unavailable', exact: true })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
    });

    test('all games keep touch controls and navigation within the viewport', async ({ page }) => {
      for (const game of games) {
        await page.goto(`/game/${game.toLowerCase()}?mode=new`);
        await expect(page).toHaveURL(/mode=resume$/);
        const menu = page.getByRole('button', { name: 'Games ▾', exact: true });
        for (const name of ['Games ▾', 'New', 'Restart', 'Rules', 'Open settings']) {
          const button = page.getByRole('button', { name, exact: true });
          await expect(button).toBeVisible();
          const box = await button.boundingBox();
          expect(box, `${game}: ${name}`).not.toBeNull();
          expect(box!.width, `${game}: ${name} width`).toBeGreaterThanOrEqual(44);
          expect(box!.height, `${game}: ${name} height`).toBeGreaterThanOrEqual(44);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        }
        const menuBox = await menu.boundingBox();
        const newBox = await page.getByRole('button', { name: 'New', exact: true }).boundingBox();
        expect(newBox!.y).toBeGreaterThanOrEqual(menuBox!.y + menuBox!.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

        await menu.tap();
        for (const name of [...games.filter((name) => name !== game), '< home']) {
          const item = page.getByRole('button', { name, exact: true });
          const box = await item.boundingBox();
          expect(box, `${game}: menu ${name}`).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        }
        await page.getByRole('button', { name: '< home', exact: true }).tap();
        await expect(page.getByText("Mum's Cards", { exact: true })).toBeVisible();
      }
    });
  });
}

test.describe('narrow home screen', () => {
  test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true });

  test('game tiles stay inside a phone viewport', async ({ page }) => {
    await page.goto('/');
    for (const game of games) {
      const tile = page.getByRole('button', { name: `New ${game}`, exact: true });
      await tile.scrollIntoViewIfNeeded();
      const box = await tile.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      await expect(tile).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
});
