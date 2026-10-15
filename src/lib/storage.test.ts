import { describe, expect, it } from "vitest";
import { defaultHousehold } from "./defaults";
import { normalizeData } from "./storage";

describe("local data migration", () => {
  it("keeps old backups usable and adds safe AI defaults", () => {
    const migrated = normalizeData({ household: defaultHousehold, scenarios: [], conversations: [] });
    expect(migrated.aiSettings).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5-mini"
    });
    expect(JSON.stringify(migrated)).not.toContain("apiKey");
  });

  it("preserves exported model settings and conversations", () => {
    const migrated = normalizeData({
      household: defaultHousehold,
      scenarios: [],
      conversations: [{ id: "1", role: "user", content: "继续上次的问题", createdAt: "2026-10-15T00:00:00.000Z" }],
      aiSettings: { provider: "openai-compatible", baseUrl: "http://10.0.0.8:8000/v1", model: "enterprise-llm" }
    });
    expect(migrated.aiSettings.model).toBe("enterprise-llm");
    expect(migrated.conversations).toHaveLength(1);
  });

  it("removes the old elder placeholder and parent presets", () => {
    const household = structuredClone(defaultHousehold);
    household.members.push({ id: "elder", name: "老人", role: "家庭照护", age: null, occupation: "待补充", monthlyIncome: 0, providentContribution: 0, retirementAge: null });
    household.members.push({ id: "male-father", name: "男方爸爸", role: "父亲", age: null, occupation: "退休", monthlyIncome: 3000, providentContribution: 0, retirementAge: null });
    household.members.push({ id: "female-mother", name: "女方妈妈", role: "母亲", age: null, occupation: "退休", monthlyIncome: 3000, providentContribution: 0, retirementAge: null });
    const migrated = normalizeData({ household, scenarios: [], conversations: [] });
    expect(migrated.household.members).toHaveLength(3);
    expect(migrated.household.members.some((member) => member.id === "elder")).toBe(false);
    expect(migrated.household.members.some((member) => member.id.includes("father") || member.id.includes("mother"))).toBe(false);
  });

  it("applies the parents expense and retirement provident preset once", () => {
    const household = structuredClone(defaultHousehold);
    household.presetRevision = 1;
    household.settings.maleLightIncome = 4000;
    household.settings.femaleLightIncome = 4000;
    household.expenses.find((expense) => expense.id === "eldercare")!.monthlyAmount = 3500;
    household.accounts.find((account) => account.id === "provident")!.retirementUsable = false;
    const migrated = normalizeData({ household, scenarios: [], conversations: [] });
    expect(migrated.household.expenses.find((expense) => expense.id === "eldercare")).toMatchObject({ name: "双方父母养老支出", monthlyAmount: 5000 });
    expect(migrated.household.accounts.find((account) => account.id === "provident")?.retirementUsable).toBe(true);
    expect(migrated.household.presetRevision).toBe(4);
    expect(migrated.household.settings.maleLightIncome).toBe(2000);
    expect(migrated.household.settings.femaleLightIncome).toBe(2000);
  });
});
