import { expect, test, type Page } from "@playwright/test";

// Installing Jelly Shark as an app (desktop and phone sizes).

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("what the browser reads", () => {
  test("the page links a manifest and the iOS home-screen icon", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/api/manifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/api\/pwa-icon\?size=180/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#070d14");
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  });

  test("the manifest describes an installable app", async ({ request }) => {
    const res = await request.get("/api/manifest");
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const m = await res.json();
    expect(m).toMatchObject({ name: "Jelly Shark", start_url: "/", scope: "/", display: "standalone" });
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192/any", "512x512/any", "512x512/maskable"]));
  });

  test("every icon in the manifest is a real PNG of the right size", async ({ request }) => {
    const { icons } = await (await request.get("/api/manifest")).json();
    for (const icon of icons as { src: string; sizes: string }[]) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const bytes = await res.body();
      expect([...bytes.subarray(0, 8)], icon.src).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(bytes.readUInt32BE(16), `${icon.src} width`).toBe(w);
      expect(bytes.readUInt32BE(20), `${icon.src} height`).toBe(h);
    }
  });

  test("the iPhone icon is a 180px PNG and odd sizes fall back", async ({ request }) => {
    const apple = await (await request.get("/api/pwa-icon?size=180")).body();
    expect(apple.readUInt32BE(16)).toBe(180);
    const odd = await (await request.get("/api/pwa-icon?size=13")).body();
    expect(odd.readUInt32BE(16)).toBe(512);
  });

  test("the manifest needs no sign-in", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/manifest")).status()).toBe(200);
    expect((await anon.get("/api/pwa-icon?size=192")).status()).toBe(200);
    await anon.dispose();
  });
});

test.describe("custom branding", () => {
  test("the installed app takes the instance's name and icon, and resets with it", async ({ page, request }) => {
    const put = (body: unknown) => page.evaluate(async (b) => (await fetch("/api/branding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).status, body);
    await page.goto("/settings");
    try {
      expect(await put({ name: "Cinema Den Deluxe Edition", accent: "#e0457b", icon: { kind: "preset", preset: "heart" } })).toBe(200);
      const m = await (await request.get("/api/manifest")).json();
      expect(m.name).toBe("Cinema Den Deluxe Edition");
      expect(m.short_name).toBe("Cinema Den D"); // 12 characters at most
      // The branded icon is a different picture from the default shark.
      const heart = await (await request.get(m.icons[0].src)).body();
      await page.evaluate(() => fetch("/api/branding", { method: "DELETE" }));
      const reset = await (await request.get("/api/manifest")).json();
      expect(reset.name).toBe("Jelly Shark");
      const shark = await (await request.get(reset.icons[0].src)).body();
      expect(Buffer.compare(heart, shark)).not.toBe(0);
    } finally {
      await page.evaluate(() => fetch("/api/branding", { method: "DELETE" }));
    }
  });
});

test.describe("the Install app button on an iPhone (no install prompt exists)", () => {
  test.use({ userAgent: IOS });

  test("is in the account menu and opens the steps", async ({ page }) => {
    await page.goto("/");
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Install app" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add to your Home Screen" })).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await expect(dialog).toContainText("Add to Home Screen");
    // Fits the screen, and Esc closes it.
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("is in Settings, and Search finds it", async ({ page }) => {
    await page.goto("/settings");
    const section = page.locator('section[aria-label="Install app"]');
    await expect(section).toContainText("Add to your home screen");
    await section.getByRole("button", { name: "Show me how" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/search?q=add to home screen");
    await page.locator('section[aria-labelledby="pages-results"]').getByRole("button", { name: /Install app/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("a browser that can install in one tap (Chrome, Edge, Android)", () => {
  test("uses the browser's own prompt instead of the steps", async ({ page }) => {
    // Chromium fires this once, early; the app has to have kept it.
    await page.addInitScript(() => {
      (window as unknown as { __prompts: number }).__prompts = 0;
      addEventListener("load", () =>
        setTimeout(() => {
          const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
          e.prompt = async () => void (window as unknown as { __prompts: number }).__prompts++;
          e.userChoice = Promise.resolve({ outcome: "accepted" });
          dispatchEvent(e);
        }, 200),
      );
    });
    await page.goto("/settings");
    const button = page.locator('section[aria-label="Install app"]').getByRole("button");
    await expect(button).toHaveText("Install");
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompts: number }).__prompts)).toBe(1);
    await expect(page.getByRole("dialog")).toBeHidden();
    // The browser allows one prompt; afterwards it falls back to the steps.
    await expect(button).toHaveText("Show me how");
  });
});

test.describe("already installed", () => {
  test("offers nothing to install", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
    await page.goto("/settings");
    await expect(page.locator('section[aria-label="Install app"]')).toContainText("You're using the installed app.");
    await expect(page.locator('section[aria-label="Install app"]').getByRole("button")).toHaveCount(0);
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: "Install app" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  });
});
