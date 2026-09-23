/**
 * PRD §13.6 end-to-end, through the real UI against the LOCAL FIXTURE stack (pnpm local:chain):
 * two members in separate browsers — create, invite, consent, seal two encrypted contributions,
 * advance chain time past the rule, relayers release, member reveals, verifier confirms.
 */
import { expect, test, type Page } from "@playwright/test";

const RPC = process.env.RELAY_RPC ?? "http://127.0.0.1:8645";
const LETTER_A = `Creator's letter ${Date.now()}: the kettle, the rooftop, the long argument about maps.`;
const LETTER_B = `Member's letter ${Date.now()}: I kept the ticket stub. Check the blue book.`;

async function rpc(method: string, params: unknown[] = []) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await r.json()) as { result: unknown }).result;
}

async function onboard(page: Page, fixture: number) {
  await page.getByRole("button", { name: new RegExp(`^#${fixture} `) }).click();
  await page.getByRole("button", { name: "Create my encryption key" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recovery kit" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^relay-recovery-/);
  await page.getByRole("button", { name: "Continue →" }).click();
}

async function consentAndSeal(page: Page, letter: string) {
  await expect(page.getByRole("heading", { name: /^Consent · / })).toBeVisible();
  await page.getByLabel(/I've read this rule/).check();
  await page.getByRole("button", { name: /^Consent to rule 0x/ }).click();
  await expect(page.getByText("Record consent: confirmed")).toBeVisible();
  await page.getByRole("link", { name: "Seal your contribution →" }).click();
  await page.getByLabel("Your letter").fill(letter);
  await page.getByRole("button", { name: "Encrypt and seal it" }).click();
  await expect(page.getByRole("heading", { name: "Sealed ✉" })).toBeVisible();
}

test("two members seal, the rule releases, a member reveals, the verifier agrees", async ({ browser }) => {
  const creator = await (await browser.newContext()).newPage();
  const member = await (await browser.newContext()).newPage();

  // Creator: onboarding, a two-member Circle with a demo rule, one invite link.
  await creator.goto("/onboarding");
  await expect(creator.getByText("LOCAL FIXTURE — a development chain")).toBeVisible();
  await onboard(creator, 1);
  await creator.waitForURL("**/app");
  await creator.goto("/circles/new");
  await creator.getByLabel("Name").fill("E2E capsule");
  await creator.getByRole("button", { name: /Use demo timing/ }).click();
  await creator.getByLabel("People, including you").fill("2");
  await creator.getByLabel("Contributions needed to open").fill("2");
  await creator.getByLabel("Invite links to create now").fill("1");
  await creator.getByRole("button", { name: /^Create Circle and publish the rule · 1 invite link$/ }).click();
  await expect(creator.getByRole("heading", { name: "Your Circle exists on-chain" })).toBeVisible();
  const invite = await creator.getByLabel("Invitation link 1").inputValue();
  const circleId = invite.match(/\/circles\/(\d+)\/invite/)![1]!;
  await creator.getByRole("link", { name: "Consent to your own rule →" }).click();
  await consentAndSeal(creator, LETTER_A);

  // Only the creator has consented: the rule is still unlocked, and nothing can be released.
  await creator.goto(`/circles/${circleId}`);
  await expect(creator.getByText("AWAITING CONSENT").first()).toBeVisible();
  await expect(creator.getByRole("button", { name: /record the release/ })).toHaveCount(0);

  // Member: opens the link, connects, accepts, consents, seals.
  await member.goto(invite);
  await expect(member.getByRole("heading", { name: /E2E capsule/ })).toBeVisible();
  await member.getByRole("link", { name: "Connect to accept →" }).click();
  await onboard(member, 2);
  await member.waitForURL(`**/circles/${circleId}/invite**`);
  if (process.env.E2E_DEBUG) {
    await member.waitForTimeout(4000);
    console.log("MEMBER URL", member.url());
    console.log("MEMBER MAIN", (await member.locator("main").innerText()).slice(0, 1500));
  }
  await member.getByRole("button", { name: "Accept invitation" }).click();
  await member.getByRole("link", { name: "Next: review the rule and consent →" }).click();
  await consentAndSeal(member, LETTER_B);

  // A non-creator consented: the rule is now locked and the Circle is collecting.
  await creator.reload();
  await expect(creator.getByText("COLLECTING").first()).toBeVisible();
  await expect(creator.getByText("Locked by member consent")).toBeVisible();

  // Plaintext never reached the chain: scan every registry log for the letter bytes.
  const logs = (await rpc("eth_getLogs", [{ fromBlock: "0x0", toBlock: "latest" }])) as { data: string }[];
  const needle = Buffer.from("ticket stub").toString("hex");
  expect(logs.some((l) => l.data.includes(needle))).toBe(false);

  // Advance LOCAL FIXTURE chain time past releaseAt; the local relayers record eligibility and receipts.
  await rpc("evm_increaseTime", [11 * 60]);
  await rpc("evm_mine");
  await member.goto(`/capsules/${circleId}`);
  await expect(async () => {
    await member.reload();
    await expect(member.getByText("Ready to open 🎉")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 90_000, intervals: [3000] });

  // Reveal: both letters decrypt in the member's browser.
  await member.getByRole("link", { name: "Open it together →" }).click();
  await member.getByRole("button", { name: "Open it" }).click();
  await expect(member.getByText(LETTER_A)).toBeVisible();
  await expect(member.getByText(LETTER_B)).toBeVisible();
  await member.getByLabel("Your reflection").fill("Worth the wait.");
  await member.getByRole("button", { name: "Share with the Circle" }).click();
  await expect(member.getByText("Worth the wait.")).toBeVisible();

  // Independent verifier, in the browser.
  await member.goto(`/verify/${circleId}`);
  await expect(member.getByText("Valid history ✓")).toBeVisible();
  await expect(member.getByText("Rule satisfied: yes")).toBeVisible();
});
