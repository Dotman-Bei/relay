import { describe, expect, it } from "vitest";
import { COPY_RULES } from "../src/index.ts";

const flagged = (s: string) => COPY_RULES.filter((r) => r.pattern.test(s)).map((r) => r.why);

describe("copy rules", () => {
  it("forbid never-claims outright", () => {
    expect(flagged("Relay makes capsules impossible to open early")).not.toEqual([]);
    expect(flagged("threshold release prevents early disclosure")).not.toEqual([]);
    expect(flagged("Your capsule is fully private")).not.toEqual([]);
  });
  it("gate deployment wording but allow negations", () => {
    expect(flagged("Deployed on BOT Chain testnet")).toEqual(["C-05"]);
    expect(flagged("Not yet deployed on BOT Chain testnet")).toEqual([]);
    expect(flagged("We are mainnet live")).toEqual(["C-06"]);
  });
});
