import { expect, test, type Page } from "@playwright/test";

// The video player, against the mock's 12-second clip (item m001) whose Intro runs from 2s to 10s.
// Runs in Chromium at both sizes and in Firefox, which has its own idea of how range inputs report a release.

const CLIP = 12;

async function openPlayer(page: Page) {
  await page.goto("/watch/m001?t=0");
  await expect.poll(() => page.evaluate(() => document.querySelector("video")?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => clipTime(page)).toBeGreaterThan(0.2); // it is really playing
}
const clipTime = (page: Page) => page.evaluate(() => document.querySelector("video")!.currentTime);
const seekBar = (page: Page) => page.getByRole("slider", { name: "Seek" });
const barValue = (page: Page) => seekBar(page).evaluate((el) => Number((el as HTMLInputElement).value));
const jumpTo = (page: Page, t: number) => page.evaluate((s) => void (document.querySelector("video")!.currentTime = s), t);
/** Where on the bar a fraction of the clip is. */
async function barPoint(page: Page, fraction: number) {
  const box = (await seekBar(page).boundingBox())!;
  return { x: box.x + box.width * fraction, y: box.y + box.height / 2 };
}
/** The time label of the hover preview bubble. */
const previewLabel = (page: Page) => page.locator('span[aria-hidden="true"]:has(> span[style*="background-position"])').innerText();
const skipButton = (page: Page) => page.getByRole("button", { name: /Skip intro/ });

test.describe("seek bar", () => {
  test("hovering previews the hovered time, not the current one", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hover on a touch screen");
    await openPlayer(page);
    await page.mouse.move(640, 400);
    const a = await barPoint(page, 0.25);
    await page.mouse.move(a.x, a.y);
    await expect(page.locator('span[style*="background-position"]')).toBeVisible();
    expect(await previewLabel(page)).toMatch(/^0:0[23]/);
    const b = await barPoint(page, 0.75);
    await page.mouse.move(b.x, b.y);
    await expect.poll(() => previewLabel(page)).toMatch(/^0:(08|09)/);
  });

  for (const [name, releaseAt] of [
    ["on the bar", (box: { x: number; y: number }) => ({ x: box.x + 200, y: box.y })],
    ["far away from the bar", (box: { x: number; y: number }) => ({ x: box.x + 200, y: box.y - 320 })],
  ] as const) {
    test(`after a drag released ${name} the bar moves again and the preview follows the mouse`, async ({ page, isMobile }) => {
      test.skip(isMobile, "dragging with a mouse");
      await openPlayer(page);
      await page.mouse.move(640, 400);
      const from = await barPoint(page, 0.2);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const to = releaseAt(from);
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();

      // The drag seeked the video...
      await expect.poll(() => clipTime(page)).toBeGreaterThan(CLIP * 0.2 + 0.5);
      // ...and the bar follows playback again instead of sticking where it was let go.
      const first = await barValue(page);
      await expect.poll(() => barValue(page), { timeout: 3000 }).toBeGreaterThan(first + 0.4);
      expect(Math.abs((await barValue(page)) - (await clipTime(page)))).toBeLessThan(0.8);

      // The preview shows where the mouse is, wherever the thumb is.
      const left = await barPoint(page, 0.08);
      await page.mouse.move(left.x, left.y);
      await expect.poll(() => previewLabel(page)).toMatch(/^0:0[01]/);
      const right = await barPoint(page, 0.92);
      await page.mouse.move(right.x, right.y);
      await expect.poll(() => previewLabel(page)).toMatch(/^0:1[01]/);
    });
  }

  test("clicking the bar seeks and the bar keeps following playback", async ({ page, isMobile }) => {
    test.skip(isMobile, "clicking with a mouse");
    await openPlayer(page);
    await page.mouse.move(640, 400);
    const p = await barPoint(page, 0.5);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => clipTime(page)).toBeGreaterThan(CLIP * 0.5 - 0.5);
    const first = await barValue(page);
    await expect.poll(() => barValue(page), { timeout: 3000 }).toBeGreaterThan(first + 0.4);
  });
});

test.describe("skip intro", () => {
  test("appears when the intro starts and skips it", async ({ page }) => {
    await openPlayer(page);
    await expect(skipButton(page)).toBeVisible({ timeout: 6000 }); // shown by itself when the intro starts at 2s
    await expect(skipButton(page)).toHaveCSS("opacity", "1");
    await skipButton(page).click();
    await expect.poll(() => clipTime(page)).toBeGreaterThan(9.5); // the intro ends at 10s
    await expect(skipButton(page)).toHaveCount(0);
  });

  test("is the topmost thing at its spot while the controls are showing, so hover and clicks reach it", async ({ page }) => {
    await openPlayer(page);
    await jumpTo(page, 3);
    await expect(skipButton(page)).toBeVisible();
    // The controls bar spans the full width and used to sit over it.
    const box = (await skipButton(page).boundingBox())!;
    const top = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim() ?? document.elementFromPoint(x, y)?.tagName,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(top).toContain("Skip intro");
  });

  test("hides with the rest of the controls and returns with them", async ({ page, isMobile }) => {
    await openPlayer(page);
    await jumpTo(page, 3);
    await expect(skipButton(page)).toHaveCSS("opacity", "1");
    // Leave the player alone: the controls fade after 3 seconds, and the button goes with them.
    await expect(skipButton(page)).toHaveCSS("opacity", "0", { timeout: 6000 });
    await expect(skipButton(page)).toHaveCSS("pointer-events", "none");
    // Touching the player brings them back.
    if (isMobile) await page.touchscreen.tap(200, 300);
    else await page.mouse.move(600, 380);
    await expect(skipButton(page)).toHaveCSS("opacity", "1");
  });

  test("reacts to hover", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hover on a touch screen");
    await openPlayer(page);
    await jumpTo(page, 3);
    const button = skipButton(page);
    await expect(button).toBeVisible();
    const scale = () => button.evaluate((el) => Number.parseFloat(getComputedStyle(el).scale === "none" ? "1" : getComputedStyle(el).scale));
    expect(await scale()).toBe(1);
    await button.hover();
    // It grows a little under the mouse (animated, so wait for it).
    await expect.poll(scale).toBeGreaterThan(1);
  });
});
