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

// Load-bearing cross-peer assertion for the advertised core action:
// "first valid answer wins". Alice (peer A) submits a valid answer FIRST,
// then Bob (peer B) submits a later valid answer. Any peer reveals the round.
// We then assert on the OPPOSITE peer (Bob) that the round really resolved to
// Alice as the winner — proving the winner determination, the prompt letter,
// and the reveal phase transition all propagate across the mesh.
test("first valid answer wins → opposite peer sees the same winner after reveal", async ({
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

    // Both peers must agree on the shared prompt before anyone can answer.
    const promptText = (await a.locator(".namegame-prompt").innerText()).trim();
    expect((await b.locator(".namegame-prompt").innerText()).trim()).toBe(promptText);

    // Extract the shared letter so each answer is *valid* (starts with it).
    const letter = /letter\s+(\w)/i.exec(promptText)?.[1];
    if (!letter) throw new Error("could not parse letter from prompt: " + promptText);

    // Alice answers FIRST with a valid word → she is the first valid answer.
    const aliceAnswer = letter + "lpha-first";
    await a.getByPlaceholder("your answer").fill(aliceAnswer);
    await a.getByRole("button", { name: "submit", exact: true }).click();

    // Wait for Alice's answer to land on Bob before Bob answers, so insertion
    // order in the shared Y.Array is deterministic (Alice before Bob).
    await expect(b.locator(".namegame-answers")).toContainText(aliceAnswer);

    // Bob answers second, also valid.
    const bobAnswer = letter + "eta-second";
    await b.getByPlaceholder("your answer").fill(bobAnswer);
    await b.getByRole("button", { name: "submit", exact: true }).click();
    await expect(a.locator(".namegame-answers")).toContainText(bobAnswer);

    // Bob (the opposite peer from the round starter) ends the round.
    await b.getByRole("button", { name: "reveal winner", exact: true }).click();

    // The winner banner must appear on BOTH peers and name ALICE — the first
    // valid answer — not Bob, even though Bob triggered the reveal.
    await expect(b.locator(".namegame-winner")).toContainText("alice");
    await expect(b.locator(".namegame-winner")).toContainText(aliceAnswer);
    await expect(a.locator(".namegame-winner")).toContainText("alice");
    await expect(a.locator(".namegame-winner")).toContainText(aliceAnswer);
  } finally {
    await cleanup();
  }
});
