/**
 * End-to-end on BOT Chain testnet through a hosted Relay (real HTTPS site, storage, steward and
 * relayers). Skipped unless RELAY_HOSTED_E2E=1. Two funded testnet keys come from the environment:
 *   RELAY_HOSTED_E2E=1 RELAY_WEB_URL=https://… CREATOR_KEY=0x… MEMBER_KEY=0x… npx playwright test e2e/testnet-hosted.spec.ts
 * Chain time is real: demo timing closes contributions after 5 minutes and opens after 10.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const enabled = process.env.RELAY_HOSTED_E2E === "1";
const RPC = process.env.RELAY_RPC ?? "https://rpc.bohr.life";
const STEP = 180_000;
const tag = Date.now();
const LETTER_A = `Hosted testnet letter A ${tag}: the red kettle, the long walk home.`;
const LETTER_B = `Hosted testnet letter B ${tag}: keep the ticket stub in the blue book.`;

async function withSessionKey(ctx: BrowserContext, key: string) {
  await ctx.addInitScript((k) => localStorage.setItem("relay:session-key:v1", k), key);
}

async function onboard(page: Page) {
  await page.getByRole("button", { name: /Browser session key/ }).click();
  await page.getByRole("button", { name: "Create my encryption key" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recovery kit" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^relay-recovery-/);
  await page.getByRole("button", { name: "Continue →" }).click();
}

async function consentAndSeal(page: Page, letter: string) {
  await expect(page.getByRole("heading", { name: /^Consent · / })).toBeVisible({ timeout: STEP });
  await page.getByLabel(/I've read this rule/).check();
  await page.getByRole("button", { name: /^Consent to rule 0x/ }).click();
  await expect(page.getByText("Record consent: confirmed")).toBeVisible({ timeout: STEP });
  await page.getByRole("link", { name: "Seal your contribution →" }).click();
  await page.getByLabel("Your letter").fill(letter);
  await page.getByRole("button", { name: "Encrypt and seal it" }).click();
  await expect(page.getByRole("heading", { name: "Sealed ✉" })).toBeVisible({ timeout: STEP });
}

test.skip(!enabled, "set RELAY_HOSTED_E2E=1 with CREATOR_KEY and MEMBER_KEY to run against a hosted testnet deployment");

test("two members use the hosted site on BOT Chain testnet; hosted relayers release it", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  const cctx = await browser.newContext();
  const mctx = await browser.newContext();
  await withSessionKey(cctx, process.env.CREATOR_KEY!);
  await withSessionKey(mctx, process.env.MEMBER_KEY!);
  const creator = await cctx.newPage();
  const member = await mctx.newPage();

  await creator.goto("/onboarding");
  await expect(creator.getByText(/LOCAL FIXTURE|PROTOCOL_CONFIG_CHANGED|not deployed/i)).toHaveCount(0);
  await onboard(creator);
  await creator.waitForURL("**/app");
  await creator.goto("/circles/new");
  await creator.getByLabel("Name").fill(`Hosted E2E ${tag}`);
  await creator.getByRole("button", { name: /Use demo timing/ }).click();
  await creator.getByLabel("People, including you").fill("2");
  await creator.getByLabel("Contributions needed to open").fill("2");
  await creator.getByLabel("Invite links to create now").fill("1");
  await creator.getByRole("button", { name: /^Create Circle and publish the rule · 1 invite link$/ }).click();
  await expect(creator.getByRole("heading", { name: "Your Circle exists on-chain" })).toBeVisible({ timeout: STEP });
  const invite = await creator.getByLabel("Invitation link 1").inputValue();
  const circleId = invite.match(/\/circles\/(\d+)\/invite/)![1]!;
  console.log(`circle ${circleId} created on testnet`);
  await creator.getByRole("link", { name: "Consent to your own rule →" }).click();
  await consentAndSeal(creator, LETTER_A);

  await member.goto(invite);
  await member.getByRole("link", { name: "Connect to accept →" }).click();
  await onboard(member);
  await member.waitForURL(`**/circles/${circleId}/invite**`);
  await member.getByRole("button", { name: "Accept invitation" }).click();
  await member.getByRole("link", { name: "Next: review the rule and consent →" }).click({ timeout: STEP });
  await consentAndSeal(member, LETTER_B);
  console.log(`circle ${circleId}: both contributions sealed`);

  const logs = (await (
    await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: "0x6f6e2c0fb44016d621e133612c61069de15cd710", fromBlock: "0x17428c2", toBlock: "latest" }] }) })
  ).json()) as { result: { data: string }[] };
  expect(logs.result.some((l) => l.data.includes(Buffer.from("ticket stub").toString("hex")))).toBe(false);

  await member.goto(`/capsules/${circleId}`);
  await expect(async () => {
    await member.reload();
    await expect(member.getByText("Ready to open 🎉")).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 16 * 60_000, intervals: [15_000] });
  console.log(`circle ${circleId}: released by the hosted relayers`);

  await member.getByRole("link", { name: "Open it together →" }).click();
  await member.getByRole("button", { name: "Open it" }).click();
  await expect(member.getByText(LETTER_A)).toBeVisible({ timeout: 60_000 });
  await expect(member.getByText(LETTER_B)).toBeVisible();
  await member.getByLabel("Your reflection").fill("Opened on the hosted testnet site.");
  await member.getByRole("button", { name: "Share with the Circle" }).click();
  await expect(member.getByText("Opened on the hosted testnet site.")).toBeVisible();

  await member.goto(`/verify/${circleId}`);
  await expect(member.getByText("Valid history ✓")).toBeVisible({ timeout: 120_000 });
  await expect(member.getByText("Rule satisfied: yes")).toBeVisible();
});
