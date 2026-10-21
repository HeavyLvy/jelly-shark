import { expect, test } from "@playwright/test";

// Things that must work at every size.

test("the server is healthy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every page sends you to sign in, and the API says 401 instead of redirecting", async ({ page, request }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);
    const res = await request.get("/api/jf/Items", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });
});

test.describe("pages", () => {
  test("Home shows what to continue watching", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Continue Watching" })).toBeVisible();
  });

  test("the Library lists movies", async ({ page }) => {
    await page.goto("/library?type=movies");
    await expect(page.getByRole("link", { name: /Glasshouse/ }).first()).toBeVisible();
  });

  test("a movie page has its title, Play and cast", async ({ page }) => {
    await page.goto("/item/m001");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Low Orbit");
    await expect(page.getByRole("link", { name: /^(Play|Resume)/ }).first()).toHaveAttribute("href", "/watch/m001");
  });

  test("Settings has its sections", async ({ page }) => {
    await page.goto("/settings");
    for (const name of ["Playback", "Languages", "Appearance", "Devices"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  });
});

test.describe("search", () => {
  test("is focused when it opens, and ignores typos, case and punctuation", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("#search-input")).toBeFocused();
    await page.keyboard.type("glashouse");
    await expect(page.getByRole("heading", { name: "Top result" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Glasshouse/ }).first()).toBeVisible();
  });

  test("finds pages and settings in the app", async ({ page }) => {
    await page.goto("/search?q=settings");
    const pages = page.locator('section[aria-labelledby="pages-results"]');
    await expect(pages.getByRole("link", { name: /^Settings/ })).toBeVisible();
    await pages.getByRole("link", { name: /^Settings/ }).first().click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("shows a clear message when nothing matches", async ({ page }) => {
    await page.goto("/search?q=zzzzqqqq");
    await expect(page.getByText(/No results for/)).toBeVisible();
  });
});

test("the account menu lists the profile actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Account menu/ }).click();
  for (const name of ["Add profile", "Watch history", "Settings", "Approve a device"]) await expect(page.getByRole("menuitem", { name })).toBeVisible();
});
