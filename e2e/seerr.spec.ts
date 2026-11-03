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
    await expect(page.getByRole("link", { name: "Lantern Harbor, Movie, 2019" })).toBeVisible();
    await expect(page.getByText("Night Ferry")).toHaveCount(0);

    // A show with some seasons already in the library says so.
    await page.goto("/search?q=night");
    await expect(page.getByRole("link", { name: "Night Ferry, TV show, 2020, Partly available" })).toBeVisible();
  });

  test("leaves out titles that are fully in the library, and people", async ({ page }) => {
    // Seerr does return both (Paper Comet is fully available; the person is a search hit), and neither is shown.
    const paper = await searchAndWait(page, "/search?q=paper");
    expect(JSON.stringify(await paper.json())).toContain("Paper Comet");
    await expect(row(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Paper Comet/ })).toHaveCount(0);
    await searchAndWait(page, "/search?q=person");
    await expect(row(page)).toHaveCount(0);
    expect(await (await page.request.get("/api/seerr/search?query=person")).text()).not.toContain("A. Person");
  });

  test("follows the Movies and TV filters", async ({ page }) => {
    await page.goto("/search?q=er&type=tv");
    await expect(page.getByRole("link", { name: /Night Ferry/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Lantern Harbor/ })).toHaveCount(0);
    await page.goto("/search?q=er&type=movies");
    await expect(page.getByRole("link", { name: /Lantern Harbor/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Night Ferry/ })).toHaveCount(0);
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

test.describe("a title's page", () => {
  /** Phones keep the facts card closed behind "Details"; open it so its rows can be read. */
  async function openDetails(page: Page) {
    const toggle = page.getByRole("button", { name: "Details" });
    if (await toggle.isVisible()) await toggle.click();
  }

  test("opens from a search result and looks like a library title", async ({ page }) => {
    await page.goto("/search?q=lantern");
    await page.getByRole("link", { name: "Lantern Harbor, Movie, 2019" }).click();
    await expect(page).toHaveURL(/\/request\/movie\/9001$/);

    const facts = page.getByRole("list", { name: "Title facts" });
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Harbor" })).toBeVisible();
    await expect(facts).toContainText("PG-13"); // the US certification, not the UK one
    await expect(facts).toContainText("2019");
    await expect(facts).toContainText("2h 16m");
    await expect(facts).toContainText("7.8");
    await expect(page.getByText("A night watchman tends the last lamp")).toBeVisible();

    await openDetails(page);
    await expect(page.getByRole("definition").filter({ hasText: /^Mara Quill, Tomas Reed$/ })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Directed by" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: /^Ila Brandt$/ })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Drama, Mystery" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Foghorn Pictures" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "May 3, 2019" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "English" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Budget $63M · Revenue $464M" })).toBeVisible();

    // The trailer opens elsewhere (and is the Trailer, not the featurette).
    const trailer = page.getByRole("link", { name: /Watch trailer/ });
    await expect(trailer).toHaveAttribute("href", "https://www.youtube.com/watch?v=mockTrailer01");
    await expect(trailer).toHaveAttribute("target", "_blank");
  });

  test("has cast, recommendations and more like this", async ({ page }) => {
    await page.goto("/request/movie/9001");
    await expect(page.getByRole("heading", { name: "Cast" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mara Quill/ })).toContainText("Captain Ines Vale");
    await expect(page.getByRole("heading", { name: "Recommended" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paper Comet, Movie, 2021, Available" })).toBeVisible();
    // "More Like This" doesn't repeat what's recommended: Paper Comet is in both lists, so only Tide Table is left.
    await expect(page.getByRole("heading", { name: "More Like This" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tide Table, Movie, 2017" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Paper Comet/ })).toHaveCount(1);
    // Titles can be followed from one page to the next.
    await page.getByRole("link", { name: /Tide Table/ }).first().click();
    await expect(page).toHaveURL(/\/request\/movie\/9003$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tide Table" })).toBeVisible();
  });

  test("a movie is requested from its page, as the signed-in person", async ({ page, request }) => {
    await page.goto("/request/movie/9001");
    await page.getByRole("button", { name: "Request", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Request sent");
    await expect(page.getByRole("status")).toContainText("approved"); // demo is an administrator, so Seerr approves it
    // The main button now says where it stands, and can't be pressed again.
    await expect(page.getByRole("button", { name: "Approved" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Request", exact: true })).toHaveCount(0);

    // Seerr got it once, from Seerr user 1 (the one matched to demo), and nothing but what the app sends.
    const made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { by: number; body: Record<string, unknown> }[];
    expect(made).toHaveLength(1);
    expect(made[0].by).toBe(1);
    expect(made[0].body).toEqual({ mediaType: "movie", mediaId: 9001 });

    // Everywhere else it shows too.
    await page.goto("/search?q=lantern");
    await expect(page.getByRole("link", { name: "Lantern Harbor, Movie, 2019, Approved" })).toBeVisible();
  });

  test("a title that's in the library opens its library page instead", async ({ page }) => {
    await page.goto("/request/movie/9002");
    // Paper Comet is Low Orbit in the library, and its own page replaces this one.
    await expect(page).toHaveURL(/\/item\/m001$/);
    await expect(page.getByRole("heading", { level: 1, name: "Low Orbit" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play" })).toHaveAttribute("href", "/watch/m001");
  });

  test("a card for a title in the library goes straight to its library page", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("region", { name: "Popular Movies" }).getByRole("link", { name: /Paper Comet/ }).click();
    await expect(page).toHaveURL(/\/item\/m001$/);
    // Back goes to where you were, not into a redirect loop.
    await page.goBack();
    await expect(page).toHaveURL(/\/discover$/);
  });

  test("a person has a page of their own with their titles", async ({ page }) => {
    await page.goto("/request/movie/9001");
    await page.getByRole("link", { name: /Mara Quill/ }).click();
    await expect(page).toHaveURL(/\/request\/person\/7001$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mara Quill" })).toBeVisible();
    await expect(page.getByText("Born March 7, 1984 in Port Alder, Norland")).toBeVisible();
    await expect(page.getByRole("region", { name: "Biography" })).toContainText("repertory theatre");
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("region", { name: "Biography" })).toContainText("unread scripts");
    // The same title listed twice by TMDB shows once.
    const acting = page.getByRole("region", { name: "Acting" });
    await expect(acting.getByRole("link", { name: /Lantern Harbor/ })).toHaveCount(1);
    await expect(acting.getByRole("link", { name: /Night Ferry/ })).toHaveCount(1);
    await acting.getByRole("link", { name: /Lantern Harbor/ }).click();
    await expect(page).toHaveURL(/\/request\/movie\/9001$/);

    await page.goto("/request/person/7003");
    await expect(page.getByRole("region", { name: "Crew" }).getByRole("link", { name: /Lantern Harbor/ })).toBeVisible();
  });

  test("says so when Seerr doesn't know a title, the link is wrong, or Seerr is off", async ({ page, baseURL }) => {
    await page.goto("/request/movie/1");
    await expect(page.getByRole("heading", { level: 1, name: "Seerr doesn't know this title" })).toBeVisible();
    await page.goto("/request/movie/abc");
    await expect(page.getByRole("heading", { level: 1, name: "Nothing here" })).toBeVisible();
    await page.goto("/request/music/9001");
    await expect(page.getByRole("heading", { level: 1, name: "Nothing here" })).toBeVisible();
    await page.request.delete("/api/seerr-config", { headers: { origin: baseURL! } });
    await page.goto("/request/movie/9001");
    await expect(page.getByRole("heading", { level: 1, name: "Requests aren't set up" })).toBeVisible();
  });

  test("fits the screen", async ({ page }) => {
    for (const url of ["/request/movie/9001", "/request/tv/9101", "/request/person/7001"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("a show's page", () => {
  test("has its seasons and episodes like a library show", async ({ page }) => {
    await page.goto("/request/tv/9101");
    const facts = page.getByRole("list", { name: "Title facts" });
    await expect(page.getByRole("heading", { level: 1, name: "Night Ferry" })).toBeVisible();
    await expect(facts).toContainText("TV-14");
    await expect(facts).toContainText("2020–Present");
    await expect(facts).toContainText("3 Seasons");
    await expect(facts).toContainText("22 Episodes");
    // Some of it is in the library, so it can be opened from here.
    await expect(page.getByRole("link", { name: "Go to show" })).toHaveAttribute("href", "/show/s002");

    const episodes = page.getByRole("region", { name: "Episodes" });
    const seasons = episodes.getByRole("group", { name: "Season" });
    await expect(seasons.getByRole("button", { name: /Specials/ })).toHaveCount(0);
    await expect(episodes.getByRole("heading", { level: 3, name: /S1 Episode 1/ })).toBeVisible();
    await expect(episodes.getByText("Available")).toBeVisible(); // season 1 is in the library
    await expect(episodes.getByRole("button", { name: /Request/ })).toHaveCount(0);

    await seasons.getByRole("button", { name: "Season 3" }).click();
    await expect(page).toHaveURL(/season=3/);
    await expect(episodes.getByRole("heading", { level: 3, name: /S3 Episode 1/ })).toBeVisible();
    await expect(episodes.getByText("Airs January 1, 2099").first()).toBeVisible();
  });

  test("a show with many seasons switches season with a dropdown on a phone, and buttons otherwise", async ({ page }) => {
    await page.goto("/request/tv/9102");
    await expect(page.getByRole("heading", { level: 1, name: "Long Haul" })).toBeVisible();
    const episodes = page.getByRole("region", { name: "Episodes" });
    const phone = (page.viewportSize()?.width ?? 1000) < 640;
    const buttons = episodes.getByRole("group", { name: "Season" });
    const dropdown = episodes.getByRole("button", { name: /^Season: Season 1/ });
    if (phone) {
      await expect(buttons).toBeHidden();
      await dropdown.click();
      await page.getByRole("option", { name: "Season 4" }).click();
    } else {
      await expect(dropdown).toBeHidden();
      await buttons.getByRole("button", { name: "Season 4" }).click();
    }
    await expect(page).toHaveURL(/season=4/);
    await expect(episodes.getByRole("heading", { level: 3, name: /S4 Episode 1/ })).toBeVisible();
  });

  test("a season can be requested from its own page, or several from the button", async ({ page, request }) => {
    await page.goto("/request/tv/9101?season=2");
    const episodes = page.getByRole("region", { name: "Episodes" });
    await episodes.getByRole("button", { name: "Request Season 2" }).click();
    await expect(page.getByRole("status")).toContainText("Request sent");
    await expect(episodes.getByRole("button", { name: /Request Season 2/ })).toHaveCount(0);
    let made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { body: { seasons: number[] } }[];
    expect(made.map((m) => m.body)).toEqual([{ mediaType: "tv", mediaId: 9101, seasons: [2] }]);

    // Only season 3 is left, and the picker knows.
    await page.getByRole("button", { name: "Request seasons" }).click();
    const picker = page.getByRole("dialog", { name: "Request seasons" });
    await expect(picker.getByLabel("Season 1")).toBeDisabled(); // in the library
    await expect(picker.getByLabel("Season 2")).toBeDisabled(); // just requested
    await expect(picker.getByLabel(/Specials/)).toHaveCount(0);
    await expect(picker.getByLabel("Season 3")).toBeChecked(); // the only open one starts ticked
    await picker.getByRole("button", { name: "Request 1 season" }).click();
    await expect(picker).toHaveCount(0);
    made = (await (await request.get(`${MOCK}/mock/requests`)).json()) as { body: { seasons: number[] } }[];
    expect(made.map((m) => m.body.seasons)).toEqual([[2], [3]]);
    // Nothing left to ask for.
    await expect(page.getByRole("button", { name: "Request seasons" })).toHaveCount(0);
  });

  test("the season picker closes with Escape or Close and sends nothing", async ({ page, request }) => {
    await page.goto("/request/tv/9101");
    await page.getByRole("button", { name: "Request seasons" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Request seasons" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await (await request.get(`${MOCK}/mock/requests`)).json()).toEqual([]);
  });

  test("shows the next episode in the details", async ({ page }) => {
    await page.goto("/request/tv/9101");
    await expect(page.getByRole("heading", { level: 1, name: "Night Ferry" })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Details" });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.getByRole("definition").filter({ hasText: "S3 E2 · January 1, 2099" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Riverlight" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Created by" })).toBeVisible();
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
    expect((await page.request.get("/api/seerr/image/w1280/lanternharborbg.jpg")).status()).toBe(200);
    for (const path of ["/api/seerr/image/original/lanternharbor.jpg", "/api/seerr/image/w1000/lanternharbor.jpg", "/api/seerr/image/w342/..%2Fsecret.jpg", "/api/seerr/image/w342/x.svg"]) {
      expect((await page.request.get(path)).status(), path).toBe(400);
    }
  });

  test("sends trimmed episodes, people and lists", async ({ page }) => {
    const season = await page.request.get("/api/seerr/tv/9101/season/1");
    const body = (await season.json()) as { episodes: { number: number; stillPath: string }[] };
    expect(body.episodes[0]).toMatchObject({ number: 1, stillPath: "/ferrystill1x1.jpg" }); // a plain file name, not the full TMDB address
    expect(JSON.stringify(body)).not.toContain("tmdb.org");
    expect((await page.request.get("/api/seerr/tv/9101/season/0")).status()).toBe(400);
    expect((await page.request.get("/api/seerr/tv/9101/season/99")).status()).toBe(404);
    expect((await page.request.get("/api/seerr/movie/9001/season/1")).status()).toBe(404);
    expect((await page.request.get("/api/seerr/movie/9001/recommendations")).status()).toBe(200);
    expect((await page.request.get("/api/seerr/movie/9001/trailers")).status()).toBe(400);
    expect((await page.request.get("/api/seerr/person/abc")).status()).toBe(400);
    const detail = await (await page.request.get("/api/seerr/movie/9001")).text();
    expect(detail).not.toContain("mediaInfo");
    expect(detail).not.toContain("credits");
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

test.describe("My requests", () => {
  const seed = (page: Page, data: object) => page.request.post(`${MOCK}/mock/requests`, { data });

  test("starts empty and links to Search", async ({ page }) => {
    const answered = page.waitForResponse((r) => r.url().includes("/api/seerr/requests"));
    await page.goto("/requests");
    await answered;
    await expect(page.getByRole("heading", { name: "My requests", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "You haven't requested anything" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Search", exact: true })).toBeVisible();
  });

  test("lists requests with where each stands, and filters them", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 1 });
    await seed(page, { mediaType: "tv", mediaId: 9102, seasons: [1, 2], status: 2 });
    await seed(page, { mediaType: "movie", mediaId: 9003, status: 3 });
    await seed(page, { mediaType: "movie", mediaId: 9002, status: 2 });
    await page.goto("/requests");
    const list = page.getByRole("list", { name: "Requests" });
    await expect(list.getByRole("link", { name: "Lantern Harbor, Waiting for approval" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Long Haul, Approved" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Tide Table, Declined" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Paper Comet, Available" })).toBeVisible();
    await expect(list).toContainText("Seasons 1 and 2");
    // Only a title that reached the library can be played.
    await expect(list.getByRole("link", { name: /^Play/ })).toHaveCount(1);
    await expect(list.getByRole("link", { name: /^Play/ })).toHaveAttribute("href", "/watch/m001");

    await page.getByRole("button", { name: /^Declined/ }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Tide Table");
    await page.getByRole("button", { name: /^All/ }).click();
    await expect(list.getByRole("listitem")).toHaveCount(4);

    await list.getByRole("link", { name: "Lantern Harbor, Waiting for approval" }).click();
    await expect(page).toHaveURL(/\/request\/movie\/9001$/);
  });

  test("shows what you just requested", async ({ page }) => {
    await page.goto("/request/movie/9001");
    await page.getByRole("button", { name: "Request", exact: true }).click();
    await expect(page.getByText("Approved", { exact: false }).first()).toBeVisible();
    await page.goto("/requests");
    await expect(page.getByRole("list", { name: "Requests" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Lantern Harbor/ })).toBeVisible();
  });

  test("the account menu links to it with a count of what is still open", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 1 });
    await seed(page, { mediaType: "movie", mediaId: 9003, status: 3 });
    await page.goto("/");
    await page.getByRole("button", { name: /Account menu/ }).click();
    const link = page.getByRole("menuitem", { name: /My requests/ });
    await expect(link).toBeVisible();
    await expect(link.getByLabel("1 in progress")).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/requests$/);
  });

  test("is hidden from the menu, and says so on the page, when Seerr is off", async ({ page, baseURL }) => {
    await page.request.delete("/api/seerr-config", { headers: { origin: baseURL! } });
    const status = page.waitForResponse((r) => r.url().includes("/api/seerr/status"));
    await page.goto("/");
    await status;
    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /My requests/ })).toHaveCount(0);
    await page.goto("/requests");
    await expect(page.getByRole("heading", { name: "Requests aren't set up" })).toBeVisible();
  });

  test("only ever lists your own requests", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 1, by: 2 });
    const res = await page.request.get("/api/seerr/requests");
    expect((await res.json()).requests).toEqual([]);
  });

  test("needs a sign-in", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/seerr/requests")).status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("Discover", () => {
  const rowOf = (page: Page, name: string) => page.getByRole("region", { name });

  test("shows trending, popular and upcoming rows of titles to request", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
    // Trending mixes movies and shows, and leaves people out.
    const trending = rowOf(page, "Trending");
    await expect(trending.getByRole("link", { name: /Lantern Harbor, Movie/ })).toBeVisible();
    await expect(trending.getByRole("link", { name: /Night Ferry, TV show/ })).toBeVisible();
    await expect(trending).not.toContainText("A. Person");
    // Rows that leave `mediaType` out still know what each title is.
    await expect(rowOf(page, "Popular Shows").getByRole("link", { name: /Night Ferry, TV show/ })).toBeVisible();
    await expect(rowOf(page, "Popular Movies").getByRole("link", { name: /Paper Comet, Movie, 2021, Available/ })).toBeVisible();
    await expect(rowOf(page, "Upcoming Movies").getByRole("link", { name: /Tide Table/ })).toBeVisible();
    // A row with nothing in it is left out.
    await expect(page.getByRole("heading", { name: "Upcoming Shows" })).toHaveCount(0);
    await trending.getByRole("link", { name: /Lantern Harbor/ }).click();
    await expect(page).toHaveURL(/\/request\/movie\/9001$/);
  });

  test("a Discover tab appears only when Seerr is connected", async ({ page, baseURL }) => {
    const nav = page.getByRole("navigation", { name: "Primary" }).locator("visible=true");
    await page.goto("/");
    await expect(nav.getByRole("link", { name: "Discover" })).toBeVisible();
    await nav.getByRole("link", { name: "Discover" }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(nav.getByRole("link", { name: "Discover" })).toHaveAttribute("aria-current", "page");
    // Everything in the tab bar fits on screen.
    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width).toBe(true);
    }

    await page.request.delete("/api/seerr-config", { headers: { origin: baseURL! } });
    const status = page.waitForResponse((r) => r.url().includes("/api/seerr/status"));
    await page.goto("/");
    await status;
    await expect(nav.getByRole("link", { name: "Search" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Discover" })).toHaveCount(0);
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover isn't set up" })).toBeVisible();
  });

  test("the rows come from fixed routes only", async ({ page, playwright, baseURL }) => {
    const ok = await page.request.get("/api/seerr/discover/trending");
    expect(ok.status()).toBe(200);
    expect(JSON.stringify(await ok.json())).not.toContain("A. Person");
    for (const bad of ["nope", "__proto__", "constructor", "movies%2Fupcoming"]) {
      expect((await page.request.get(`/api/seerr/discover/${bad}`)).status(), bad).toBe(404);
    }
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/seerr/discover/trending")).status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("Cancelling a request", () => {
  const seed = (page: Page, data: object) => page.request.post(`${MOCK}/mock/requests`, { data });
  const mock = async (page: Page) => (await (await page.request.get(`${MOCK}/mock/requests`)).json()) as { id: number }[];

  test("takes back a waiting request from My requests, after asking", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 1 });
    await seed(page, { mediaType: "movie", mediaId: 9003, status: 2 });
    await page.goto("/requests");
    const list = page.getByRole("list", { name: "Requests" });
    // Only a request that is still waiting can be cancelled.
    await expect(page.getByRole("button", { name: /Cancel request for/ })).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel request for Lantern Harbor" }).click();
    await page.getByRole("button", { name: "Keep it" }).click();
    expect(await mock(page)).toHaveLength(2);

    await page.getByRole("button", { name: "Cancel request for Lantern Harbor" }).click();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).not.toContainText("Lantern Harbor");
    expect(await mock(page)).toHaveLength(1);
  });

  test("a waiting request can be cancelled from the title's page, and it can be requested again", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 1 });
    await page.goto("/request/movie/9001");
    await expect(page.getByRole("button", { name: "Requested" })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel request for Lantern Harbor" }).click();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(page.getByRole("button", { name: "Request", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Cancel request/ })).toHaveCount(0);
  });

  test("an approved request has no cancel button", async ({ page }) => {
    await seed(page, { mediaType: "movie", mediaId: 9001, status: 2 });
    await page.goto("/request/movie/9001");
    await expect(page.getByRole("button", { name: "Approved" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Cancel request/ })).toHaveCount(0);
  });

  test("the server only cancels your own waiting requests", async ({ page, baseURL, playwright }) => {
    const del = (id: number | string, origin = baseURL!) => page.request.delete(`/api/seerr/request/${id}`, { headers: { origin } });
    const theirs = await (await seed(page, { mediaType: "movie", mediaId: 9001, status: 1, by: 2 })).json();
    const approved = await (await seed(page, { mediaType: "movie", mediaId: 9003, status: 2 })).json();
    const mine = await (await seed(page, { mediaType: "movie", mediaId: 9002, status: 1 })).json();

    expect((await del(theirs.id)).status()).toBe(403);
    expect((await del(approved.id)).status()).toBe(409);
    expect((await del(mine.id, "https://evil.example")).status()).toBe(403);
    expect((await del("abc")).status()).toBe(400);
    expect((await del(9999)).status()).toBe(404);
    expect(await mock(page)).toHaveLength(3);
    expect((await del(mine.id)).status()).toBe(200);
    expect((await mock(page)).map((r) => r.id).sort()).toEqual([theirs.id, approved.id].sort());

    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.delete(`/api/seerr/request/${theirs.id}`, { headers: { origin: baseURL! } })).status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("See all", () => {
  test("each Discover row links to its full list", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("region", { name: "Popular Movies" }).getByRole("link", { name: "See all" }).click();
    await expect(page).toHaveURL(/\/discover\/movies$/);
    await expect(page.getByRole("heading", { name: "Popular Movies", level: 1 })).toBeVisible();
  });

  test("shows a whole list a page at a time, without repeats", async ({ page }) => {
    await page.goto("/discover/movies");
    const grid = page.getByRole("list", { name: "Popular Movies" });
    await expect(grid.getByRole("listitem")).toHaveCount(2);
    await expect(grid.getByRole("link", { name: /Tide Table/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Load more" }).click();
    // Page two repeats Lantern Harbor and adds Tide Table.
    await expect(grid.getByRole("link", { name: /Tide Table/ })).toBeVisible();
    await expect(grid.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    await expect(page.getByText("That's everything.")).toBeVisible();
    await grid.getByRole("link", { name: /Tide Table/ }).click();
    await expect(page).toHaveURL(/\/request\/movie\/9003$/);
  });

  test("a list with a single page has nothing more to load", async ({ page }) => {
    await page.goto("/discover/upcoming-movies");
    await expect(page.getByRole("link", { name: /Tide Table/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  });

  test("an unknown list says so, and the server checks the page number", async ({ page }) => {
    await page.goto("/discover/nope");
    await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
    expect((await page.request.get("/api/seerr/discover/movies?page=2")).status()).toBe(200);
    for (const bad of ["0", "-1", "501", "x", "1.5", "99999"]) {
      expect((await page.request.get(`/api/seerr/discover/movies?page=${bad}`)).status(), bad).toBe(400);
    }
    const body = await (await page.request.get("/api/seerr/discover/movies?page=2")).json();
    expect(body).toMatchObject({ page: 2, totalPages: 2 });
  });
});
