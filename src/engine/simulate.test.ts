import { describe, expect, it } from "vitest";
import { defaultHousehold } from "@/lib/defaults";
import { calculateMortgage } from "./mortgage";
import { runSimulation } from "./simulate";

describe("FIRE engine", () => {
  it("keeps the provident fund outside current investable assets", () => {
    const result = runSimulation(structuredClone(defaultHousehold));
    expect(result.summary.investableNow).toBe(1813000);
  });

  it("unlocks remaining retirement-usable provident funds at retirement", () => {
    const input = structuredClone(defaultHousehold);
    input.housing.enabled = false;
    input.settings.maleRetirementAge = 34;
    input.settings.femaleRetirementAge = 35;
    const result = runSimulation(input);
    expect(result.ledger[0].provident).toBe(0);
    expect(result.summary.retirementAssets).toBeGreaterThan(result.summary.investableNow);
  });

  it("does not count an unknown insurance cash value", () => {
    const input = structuredClone(defaultHousehold);
    input.accounts.find((item) => item.id === "insurance")!.balance = 300000;
    const result = runSimulation(input);
    expect(result.summary.investableNow).toBe(1813000);
  });

  it("records depletion instead of allowing negative assets", () => {
    const input = structuredClone(defaultHousehold);
    input.housing.enabled = false;
    input.settings.retirementMonthlyExpense = 100000;
    input.settings.maleRetirementAge = 34;
    input.settings.femaleRetirementAge = 35;
    input.settings.maleLightIncome = 0;
    input.settings.femaleLightIncome = 0;
    const result = runSimulation(input);
    expect(result.summary.firstShortfallMonth).not.toBeNull();
    expect(result.ledger.every((item) => item.cash >= 0 && item.investments >= 0)).toBe(true);
  });

  it("models a one-year job-loss window without ending employment forever", () => {
    const input = structuredClone(defaultHousehold);
    input.housing.enabled = false;
    input.settings.maleJobLossMonth = "2027-10";
    input.settings.maleJobLossMonths = 12;
    const result = runSimulation(input);
    expect(result.ledger[12].workIncome).toBe(27000);
    expect(result.ledger[24].workIncome).toBe(43000);
  });
});

describe("mortgage", () => {
  it("amortizes equal-payment loans to zero", () => {
    const schedule = calculateMortgage(850000, 0.031, 30, "equal-payment");
    expect(schedule).toHaveLength(360);
    expect(schedule.at(-1)?.balance).toBe(0);
    expect(schedule[0].payment).toBeGreaterThan(0);
  });
});
