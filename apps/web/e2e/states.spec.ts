/** PRD §9.3 protocol states, forced by rewriting the deployment record the client fetches. */
import { expect, test } from "@playwright/test";

const signedIn = { kind: "fixture", fixture: 0 };

test("a chain-ID or bytecode mismatch shows PROTOCOL_CONFIG_CHANGED and stops transactions", async ({ page }) => {
  await page.route("**/relay/deployment.local.json", async (route) => {
    const res = await route.fetch();
    const d = await res.json();
    d.chainId = 968; // what a probe would record for BOT Chain testnet; the RPC says 31337
    d.contract.runtimeSha256 = "0".repeat(64);
    await route.fulfill({ response: res, json: d });
  });
  await page.addInitScript((w) => localStorage.setItem("relay:wallet:v1", JSON.stringify(w)), signedIn);
  await page.goto("/circles/new");
  await expect(page.getByText("PROTOCOL_CONFIG_CHANGED — transactions are stopped.")).toBeVisible();
  await expect(page.getByText(/RPC reports chain 31337; deployment record says 968/)).toBeVisible();
  await expect(page.getByText(/does not match the recorded 000000000000/)).toBeVisible();
  await page.getByLabel("Name").fill("Should not be created");
  const submit = page.getByRole("button", { name: /Transactions are off: PROTOCOL_CONFIG_CHANGED/ });
  await expect(submit).toBeDisabled();
});

test("with no deployment record the app says so and disables transactions", async ({ page }) => {
  await page.route("**/relay/deployment.local.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.addInitScript((w) => localStorage.setItem("relay:wallet:v1", JSON.stringify(w)), signedIn);
  await page.goto("/");
  await expect(page.getByText(/Relay is not deployed on the LOCAL FIXTURE chain yet — transactions are off/)).toBeVisible();
  await page.goto("/verify/1");
  await expect(page.getByText("Nothing to verify on this network yet")).toBeVisible();
});
