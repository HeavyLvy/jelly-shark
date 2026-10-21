import { expect, test, type Page } from "@playwright/test";

// Phone layout (390x844, touch). Each test is a bug that shipped once or a rule the design depends on.

/** The page may not scroll sideways. */
async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Starts the first song on an artist's page, so the player bar shows. */
async function playSomething(page: Page) {
  await page.goto("/music/artist/ar101");
  // On phones a row is just art, title and ⋯: tap the art to play it.
  await page.getByRole("row").nth(1).tap({ position: { x: 24, y: 28 } });
  await expect(page.locator('section[aria-label="Music player"]')).toBeVisible();
}

const PAGES = ["/", "/library", "/library?type=movies", "/search", "/settings", "/history", "/music", "/music/search", "/music/library", "/item/m001", "/show/s002", "/person/pe01", "/music/artist/ar101"];

test.describe("phone layout", () => {
  for (const path of PAGES) {
    test(`${path} doesn't scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });
  }

  test("the main menu is a bar at the bottom, and there is only one", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator('nav[aria-label="Primary"]:visible');
    await expect(nav).toHaveCount(1);
    const box = (await nav.boundingBox())!;
    expect(box.y).toBeGreaterThan(844 * 0.8);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // Big enough to hit with a thumb.
    for (const link of await nav.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // The profile stays at the top right.
    const avatar = (await page.getByRole("button", { name: /Account menu/ }).boundingBox())!;
    expect(avatar.y).toBeLessThan(60);
    expect(avatar.x + avatar.width).toBeGreaterThan(390 - 60);
  });

  test("Music shows the same single menu, not a second one", async ({ page }) => {
    await page.goto("/music");
    await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Music"]')).toBeHidden();
    // Your Library moved up into the music top bar.
    await page.getByRole("link", { name: "Your Library" }).tap();
    await expect(page).toHaveURL(/\/music\/library/);
  });

  test("the music player floats above the menu without touching it", async ({ page }) => {
    await playSomething(page);
    const bar = (await page.locator('section[aria-label="Music player"]:visible').boundingBox())!;
    const nav = (await page.locator('nav[aria-label="Primary"]:visible').boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y);
    // ...also on a main page.
    await page.locator('nav[aria-label="Primary"]:visible').getByRole("link", { name: "Home" }).tap();
    await expect(page).toHaveURL("/");
    const bar2 = (await page.locator('section[aria-label="Music player"]:visible').boundingBox())!;
    const nav2 = (await page.locator('nav[aria-label="Primary"]:visible').boundingBox())!;
    expect(bar2.y + bar2.height).toBeLessThanOrEqual(nav2.y);
  });

  test("account menu buttons respond to taps, even when the browser drops focus (iOS)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Account menu/ }).tap();
    await expect(page.getByRole("menu")).toBeVisible();
    // iOS never focuses a tapped button, so the focused item just loses focus.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Settings" }).tap();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("a title page has a back button, a full-width Play and action circles under it", async ({ page }) => {
    await page.goto("/item/m001");
    const back = page.getByRole("link", { name: "Back to Movies" });
    await expect(back).toBeVisible();
    const b = (await back.boundingBox())!;
    expect(b.x).toBeLessThan(24);
    expect(b.y).toBeLessThan(24);
    expect(b.width).toBeGreaterThanOrEqual(44);

    const play = page.getByRole("link", { name: /^(Play|Resume)/ }).first();
    const p = (await play.boundingBox())!;
    expect(p.width).toBeGreaterThan(390 - 48);

    const circles = page.getByRole("button", { name: /(playlist|favorites|watched)$/ });
    expect(await circles.count()).toBeGreaterThanOrEqual(3);
    for (const c of await circles.all()) {
      const box = (await c.boundingBox())!;
      expect(box.y).toBeGreaterThan(p.y + p.height - 1);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeCloseTo(box.height, 0);
    }
  });

  test("the back button on a title goes to its library", async ({ page }) => {
    await page.goto("/show/s002");
    await page.getByRole("link", { name: "Back to TV Shows" }).tap();
    await expect(page).toHaveURL(/\/library\?type=tv/);
  });

  test("an actor page has a back button", async ({ page }) => {
    await page.goto("/item/m001");
    await page.getByRole("link", { name: /^[A-Z][a-z]+ [A-Z]/ }).filter({ has: page.locator("img, svg") }).first().tap().catch(() => {});
    await page.goto("/person/pe01");
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  });

  test("Home shows only Resume or Play on the featured title, and the title opens its page", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('section[aria-label="Featured"]');
    await expect(hero.getByRole("link", { name: /^(Play|Resume)/ })).toBeVisible();
    await expect(hero.getByRole("link", { name: "More info", exact: true })).toBeHidden();
    await expect(hero.getByRole("button", { name: /playlist|favorites/ })).toBeHidden();
    await hero.getByRole("link", { name: /^More info about/ }).tap();
    await expect(page).toHaveURL(/\/(item|show)\//);
  });

  test("Search opens ready to type", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("#search-input")).toBeFocused();
  });
});
