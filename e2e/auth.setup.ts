import { test as setup, expect } from "@playwright/test";

// Sign in once (the mock accepts any username and password) and let every other test reuse the session.
setup("sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill("demo");
  await page.getByLabel(/password/i).fill("anything");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
