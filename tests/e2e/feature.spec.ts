import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("alice submits an answer → bob sees it; both agree on the prompt", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(700);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(500);

    const promptA = (await a.locator(".namegame-prompt").innerText()).trim();
    const promptB = (await b.locator(".namegame-prompt").innerText()).trim();
    if (promptA !== promptB) throw new Error("prompts disagree: " + promptA + " vs " + promptB);

    await a.getByPlaceholder("your answer").fill("Test answer xyz");
    await a.getByRole("button", { name: "submit", exact: true }).click();

    await expect(b.locator(".namegame-answers")).toContainText("alice");
    await expect(b.locator(".namegame-answers")).toContainText("Test answer xyz");
  } finally {
    await cleanup();
  }
});
