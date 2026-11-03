import { expect, test, type Page } from "@playwright/test";

// Requesting through Seerr, against the fake Seerr (scripts/mock-seerr.mjs, port 5057).
// Each test connects Seerr itself and leaves everything as it found it.

const MOCK = "http://127.0.0.1:5057";

async function connect(page: Page, baseURL: string) {
  const res = await page.request.put("/api/seerr-config", { data: { url: MOCK, apiKey: "mock-seerr-api-key" }, headers: { origin: baseURL } });
  expect(res.ok()).toBe(true);
}

test.beforeEach(async ({ page, baseURL }) => {
  await connect(page, baseURL!);
});

test.afterEach(async ({ page, baseURL }) => {
  await page.request.delete("/api/seerr-config", { headers: { origin: baseURL! } });
  await page.request.delete(`${MOCK}/mock/requests`);
});

/** Opens a search and waits for Seerr's answer, so a test that expects nothing to show isn't just early. */
async function searchAndWait(page: Page, url: string) {
  const answered = page.waitForResponse((r) => r.url().includes("/api/seerr/search"));
  await page.goto(url);
  return answered;
}

const row = (page: Page) => page.getByRole("heading", { name: "Not in your library" });

test.describe("search", () => {
  test("offers titles that aren't in the library, with their status", async ({ page }) => {
    await page.goto("/search?q=lantern");
    await expect(row(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Lantern Harbor, Movie, 2019" })).toBeVisible();
    await expect(page.getByText("Night Ferry")).toHaveCount(0);

    // A show with some seasons already in the library says so.
    await page.goto("/search?q=night");
    await expect(page.getByRole("button", { name: "Request Night Ferry, TV show, 2020, Partly available" })).toBeVisible();
  });

  test("leaves out titles that are fully in the library, and people", async ({ page }) => {
    // Seerr does return both (Paper Comet is fully available; the person is a search hit), and neither is shown.
    const paper = await searchAndWait(page, "/search?q=paper");
    expect(JSON.stringify(await paper.json())).toContain("Paper Comet");
    await expect(row(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Paper Comet/ })).toHaveCount(0);
    await searchAndWait(page, "/search?q=person");
    await expect(row(page)).toHaveCount(0);
    expect(await (await page.request.get("/api/seerr/search?query=person")).text()).not.toContain("A. Person");
  });

  test("follows the Movies and TV filters", async ({ page }) => {
    await page.goto("/search?q=er&type=tv");
    await expect(page.getByRole("button", { name: /Request Night Ferry/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Request Lantern Harbor/ })).toHaveCount(0);
    await page.goto("/search?q=er&type=movies");
    await expect(page.getByRole("button", { name: /Request Lantern Harbor/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Request Night Ferry/ })).toHaveCount(0);
  });

  test("has no extra row when Seerr isn't connected", async ({ page, baseURL }) => {
    await page.request.delete("/api/seerr-config", { headers: { origin: baseURL! } });
    expect(await (await page.request.get("/api/seerr/status")).json()).toEqual({ enabled: false });
    const status = page.waitForResponse((r) => r.url().includes("/api/seerr/status"));
    await page.goto("/search?q=lantern");
    await status;
    await expect(page.getByRole("heading", { name: "Top result" }).or(page.getByRole("heading", { name: /No results/ }))).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });
});

test.describe("requesting", () => {
  test("a movie is requested as the signed-in person", async ({ page, request }) => {
    await page.goto("/search?q=lantern");
    await page.getByRole("button", { name: /Request Lantern Harbor/ }).click();
    const dialog = page.getByRole("dialog", { name: "Lantern Harbor" });
    await expect(dialog).toBeVisible();
    // The dialog sits inside the screen at every size (a sheet from the bottom on phones).
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await dialog.getByRole("button", { name: "Request", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Request sent");
    await expect(dialog).toContainText("approved");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    // Seerr got it once, from Seerr user 1 (the one matched to demo), and nothing but what the app sends.
    const made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { by: number; body: Record<string, unknown> }[];
    expect(made).toHaveLength(1);
    expect(made[0].by).toBe(1);
    expect(made[0].body).toEqual({ mediaType: "movie", mediaId: 9001 });

    // The card now shows it, and it can't be asked for twice.
    await expect(page.getByRole("button", { name: "Request Lantern Harbor, Movie, 2019, Approved" })).toBeVisible();
    await page.getByRole("button", { name: /Request Lantern Harbor/ }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Request", exact: true })).toBeDisabled();
    await expect(page.getByRole("dialog")).toContainText("nothing more to request");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("chosen seasons of a show are requested, and taken ones can't be picked", async ({ page, request }) => {
    await page.goto("/search?q=night");
    await page.getByRole("button", { name: /Request Night Ferry/ }).click();
    const dialog = page.getByRole("dialog", { name: "Night Ferry" });
    await expect(dialog.getByLabel("Season 2")).toBeVisible();
    await expect(dialog.getByLabel(/Specials/)).toHaveCount(0);
    await expect(dialog.getByLabel(/Season 1/)).toBeDisabled(); // already in the library
    const send = dialog.getByRole("button", { name: /^Request/ }).last();
    await expect(send).toBeDisabled();

    await dialog.getByLabel("Season 3").check();
    await expect(dialog.getByRole("button", { name: "Request 1 season" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Select all" }).click(); // 2 and 3: the only open ones
    await expect(dialog.getByRole("button", { name: "Request 2 seasons" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Request 2 seasons" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Request sent");

    const made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { body: { seasons: number[] } }[];
    expect(made[0].body).toEqual({ mediaType: "tv", mediaId: 9101, seasons: [2, 3] });
    await dialog.getByRole("button", { name: "Done" }).click();

    // Both are now requested, so nothing is left to pick.
    await page.getByRole("button", { name: /Request Night Ferry/ }).click();
    const again = page.getByRole("dialog", { name: "Night Ferry" });
    await expect(again.getByLabel("Season 2")).toBeDisabled();
    await expect(again.getByLabel("Season 3")).toBeDisabled();
  });

  test("closing the dialog with Escape or the close button sends nothing", async ({ page, request }) => {
    await page.goto("/search?q=lantern");
    await page.getByRole("button", { name: /Request Lantern Harbor/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Request Lantern Harbor/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await (await request.get(`${MOCK}/mock/requests`)).json()).toEqual([]);
  });
});

test.describe("the Seerr API", () => {
  test("needs a sign-in", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/seerr/search?query=lantern")).status()).toBe(401);
    expect((await anon.get("/api/seerr/image/w342/lanternharbor.jpg")).status()).toBe(401);
    await anon.dispose();
  });

  test("refuses a request from another site, and bodies it doesn't understand", async ({ page, baseURL }) => {
    const post = (data: unknown, origin = baseURL!) => page.request.post("/api/seerr/request", { data, headers: { origin } });
    expect((await post({ mediaType: "movie", mediaId: 9001 }, "https://evil.example")).status()).toBe(403);
    for (const bad of [{}, { mediaType: "movie" }, { mediaType: "movie", mediaId: "9001" }, { mediaType: "tv", mediaId: 9101 }, { mediaType: "tv", mediaId: 9101, seasons: [] }, { mediaType: "tv", mediaId: 9101, seasons: [0] }, { mediaType: "music", mediaId: 1 }]) {
      expect((await post(bad)).status(), JSON.stringify(bad)).toBe(400);
    }
  });

  test("passes on only what it means to: no 4K, profile, folder or other person", async ({ page, baseURL, request }) => {
    const res = await page.request.post("/api/seerr/request", { data: { mediaType: "movie", mediaId: 9001, is4k: true, profileId: 3, rootFolder: "/x", userId: 2, ignoreQuota: true }, headers: { origin: baseURL! } });
    expect(res.status()).toBe(201);
    const made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { by: number; body: Record<string, unknown> }[];
    expect(made[0].body).toEqual({ mediaType: "movie", mediaId: 9001 });
    expect(made[0].by).toBe(1);
  });

  test("serves posters from our own address and refuses odd paths", async ({ page }) => {
    const ok = await page.request.get("/api/seerr/image/w342/lanternharbor.jpg");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toMatch(/^image\//);
    for (const path of ["/api/seerr/image/original/lanternharbor.jpg", "/api/seerr/image/w342/..%2Fsecret.jpg", "/api/seerr/image/w342/x.svg"]) {
      expect((await page.request.get(path)).status(), path).toBe(400);
    }
  });

  test("never sends the API key or Seerr's own details to the browser", async ({ page }) => {
    const search = await (await page.request.get("/api/seerr/search?query=lantern")).text();
    expect(search).not.toContain("mock-seerr-api-key");
    expect(search).not.toContain("mediaInfo");
    expect(search).not.toContain(MOCK);
  });
});

test.describe("accounts in Settings", () => {
  test("shows who is linked to whom, and lets an administrator pick another account", async ({ page }) => {
    await page.goto("/settings");
    const section = page.getByRole("region", { name: "Seerr" });
    const accounts = section.getByRole("list", { name: "Seerr accounts" });
    await expect(accounts.getByRole("listitem").filter({ hasText: "demo" })).toContainText("Matched to demo");
    const guest = accounts.getByRole("listitem").filter({ hasText: "guest" });
    await expect(guest).toContainText("No Seerr account yet");

    await guest.getByRole("button", { name: /Seerr account for guest/ }).click();
    await page.getByRole("option", { name: "demo" }).click();
    await expect(guest).toContainText("Chosen: demo");

    await guest.getByRole("button", { name: /Seerr account for guest/ }).click();
    await page.getByRole("option", { name: "Automatic" }).click();
    await expect(guest).toContainText("No Seerr account yet");
  });
});
