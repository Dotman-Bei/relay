import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkLedger, loadLedger, renderMarkdown } from "./index.ts";

const root = resolve(import.meta.dirname, "../../..");
const cmd = process.argv[2];
const ledger = loadLedger(root);
if (cmd === "generate") {
  writeFileSync(resolve(root, "docs/claims.md"), renderMarkdown(ledger));
  console.log("docs/claims.md regenerated");
} else if (cmd === "check") {
  const issues = checkLedger(root, ledger);
  for (const i of issues) console.log(`${i.level === "error" ? "✗" : "!"} ${i.message}`);
  const errors = issues.filter((i) => i.level === "error").length;
  console.log(errors ? `claim ledger check FAILED (${errors} errors)` : `claim ledger check passed (${ledger.claims.length} claims)`);
  process.exit(errors ? 1 : 0);
} else {
  console.log("usage: cli.ts generate|check");
}
