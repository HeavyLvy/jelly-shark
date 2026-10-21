import { expect, test, type Page } from "@playwright/test";

// Desktop layout (1280x800).

/** Starts the first song of the artist page, so the player bar shows. (The row's middle is a link, so use its play button.) */
async function playFirstSong(page: Page) {
  await page.goto("/music/artist/ar101");
  const row = page.getByRole("row").nth(1);
  await row.hover();
  await row.getByRole("button", { name: /^Play / }).click();
  await expect(page.locator('section[aria-label="Music player"]')).toBeVisible();
}

test.describe("desktop layout", () => {
  test("the main menu is the floating pill at the top, and the phone bar is hidden", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator('nav[aria-label="Primary"]:visible');
    await expect(nav).toHaveCount(1);
    expect((await nav.boundingBox())!.y).toBeLessThan(40);
    await expect(page.getByRole("button", { name: /Account menu/ })).toContainText("demo");
  });

  test("Music has its own top bar and no phone tab bars", async ({ page }) => {
    await page.goto("/music");
    await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden();
    await expect(page.locator('nav[aria-label="Music"]')).toBeHidden();
    await expect(page.getByRole("link", { name: "Music home" })).toBeVisible();
  });

  test("a title page keeps its text back link and has no phone back circle", async ({ page }) => {
    await page.goto("/item/m001");
    const back = page.getByRole("link", { name: /Movies$/ }).first();
    await expect(back).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Movies" })).toBeHidden();
  });

  test("Home's featured title keeps all its buttons", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('section[aria-label="Featured"]');
    await expect(hero.getByRole("link", { name: "More info", exact: true })).toBeVisible();
  });
});

test.describe("music player", () => {
  test("Space plays or pauses; it doesn't press the button you last clicked", async ({ page }) => {
    await page.goto("/music/artist/ar101");
    await playFirstSong(page);
    const bar = page.locator('section[aria-label="Music player"]');
    const shuffle = bar.getByRole("button", { name: "Shuffle" });
    await shuffle.click();
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
    await shuffle.click(); // back to off for the next test
  });

  test("Space still presses a button you reached with the keyboard", async ({ page }) => {
    await page.goto("/music/artist/ar101");
    await playFirstSong(page);
    const bar = page.locator('section[aria-label="Music player"]');
    const shuffle = bar.getByRole("button", { name: "Shuffle" });
    await shuffle.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const before = await shuffle.getAttribute("aria-pressed");
    await page.keyboard.press("Space");
    await expect(shuffle).not.toHaveAttribute("aria-pressed", before!);
    await page.keyboard.press("Space"); // and back
  });
});

test.describe("liked songs on an artist's page", () => {
  test("appear when you like a song by that artist, and go when you unlike it", async ({ page }) => {
    await page.goto("/music/artist/ar101");
    const liked = page.getByRole("heading", { name: /^Liked songs/ });
    await expect(page.getByRole("heading", { name: "Popular" })).toBeVisible();
    await expect(liked).toHaveCount(0);

    const row = page.locator('section[aria-label="Popular"]').getByRole("row").nth(1);
    await row.hover();
    await row.getByRole("button", { name: /^Save .* to Liked$/ }).click();
    await expect(liked).toBeVisible();
    await expect(liked).toContainText("1");

    const section = page.locator('section[aria-labelledby="liked-by-artist"]');
    await section.getByRole("row").nth(1).hover();
    await section.getByRole("button", { name: /^Remove .* from Liked$/ }).click();
    await expect(liked).toHaveCount(0);
  });
});

test.describe("search", () => {
  test("a song in the results has the same right-click menu as elsewhere", async ({ page }) => {
    await page.goto("/search?q=juno");
    const songs = page.locator('section[aria-labelledby="songs"]');
    await expect(songs.getByRole("listitem").first()).toBeVisible();
    await songs.getByRole("listitem").first().click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Play next" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Add to queue" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Add to playlist…" })).toBeVisible();
  });
});
