import { expect, test } from "@playwright/test";

test("the Playwright harness runs a browser test", async ({ page }) => {
  await page.setContent("<main><h1>Krypton</h1></main>");

  await expect(page.getByRole("heading", { name: "Krypton" })).toBeVisible();
});
