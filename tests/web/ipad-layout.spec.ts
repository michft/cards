import { expect, test } from '@playwright/test';

const games = ['Clock', 'FreeCell', 'Klondike', 'Pyramid', 'Spider'] as const;

for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
  test.describe(`11-inch iPad ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

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
