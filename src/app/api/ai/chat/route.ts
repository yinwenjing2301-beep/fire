import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runSimulation } from "@/engine/simulate";
import type { HouseholdSnapshot } from "@/types/finance";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  household: z.object({ version: z.literal(1) }).passthrough(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional().default([]),
  scenarios: z.array(z.object({ name: z.string(), createdAt: z.string(), result: z.object({ summary: z.record(z.string(), z.unknown()) }).passthrough() }).passthrough()).max(20).optional().default([]),
  currentRiskSettings: z.object({ annualVolatility: z.number(), iterations: z.number(), seed: z.number(), endAge: z.number() }).passthrough(),
  riskResult: z.object({ householdUpdatedAt: z.string(), createdAt: z.string(), input: z.object({ settings: z.record(z.string(), z.unknown()) }).passthrough(), result: z.record(z.string(), z.unknown()) }).passthrough().nullable().optional(),
  stressResult: z.object({ name: z.string(), householdUpdatedAt: z.string(), createdAt: z.string(), input: z.object({ settings: z.record(z.string(), z.unknown()) }).passthrough().optional(), baseline: z.record(z.string(), z.unknown()), impacted: z.record(z.string(), z.unknown()), improvements: z.array(z.record(z.string(), z.unknown())) }).passthrough().nullable().optional(),
  connection: z.object({
    baseUrl: z.string().url(),
    model: z.string().min(1),
    apiKey: z.string().optional().default("")
  })
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "请求数据无效", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const household = parsed.data.household as unknown as HouseholdSnapshot;
  const simulation = runSimulation(household);
  const riskSettingsChanged = (settings: Record<string, unknown>) => settings.annualVolatility !== parsed.data.currentRiskSettings.annualVolatility
    || settings.iterations !== parsed.data.currentRiskSettings.iterations || settings.seed !== parsed.data.currentRiskSettings.seed
    || settings.endAge !== parsed.data.currentRiskSettings.endAge;
  const compactContext = {
    baseMonth: household.baseMonth,
    members: household.members.map(({ name, age, occupation, monthlyIncome, retirementAge }) => ({ name, age, occupation, monthlyIncome, retirementAge })),
    accounts: household.accounts.map(({ name, category, balance, retirementUsable, note }) => ({ name, category, balance, retirementUsable, note })),
    currentMonthlyExpense: household.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0),
    housing: household.housing,
    assumptions: household.settings,
    lifecycle: household.lifecycle,
    socialSecurity: household.socialSecurity.map(({ memberId, currentRegion, paidYears, continueContributions, futureRegion, monthlyContribution, medicalCoverage, annualCommercialPremium, pensionStartAge, estimatedMonthlyPension, pensionConfirmed }) => ({ memberId, currentRegion, paidYears, continueContributions, futureRegion, monthlyContribution, medicalCoverage, annualCommercialPremium, pensionStartAge, estimatedMonthlyPension, pensionConfirmed })),
    withdrawalStrategy: household.withdrawalStrategy,
    deterministicResult: simulation.summary,
    risks: simulation.risks,
    savedScenarios: parsed.data.scenarios.map((scenario) => ({ name: scenario.name, createdAt: scenario.createdAt, summary: scenario.result.summary })),
    riskAnalysis: parsed.data.riskResult ? {
      createdAt: parsed.data.riskResult.createdAt,
      stale: parsed.data.riskResult.householdUpdatedAt !== household.updatedAt || riskSettingsChanged(parsed.data.riskResult.input.settings),
      settings: parsed.data.riskResult.input.settings,
      result: parsed.data.riskResult.result
    } : null,
    stressAnalysis: parsed.data.stressResult ? {
      name: parsed.data.stressResult.name,
      createdAt: parsed.data.stressResult.createdAt,
      stale: parsed.data.stressResult.householdUpdatedAt !== household.updatedAt || !parsed.data.stressResult.input || riskSettingsChanged(parsed.data.stressResult.input.settings),
      baseline: parsed.data.stressResult.baseline,
      impacted: parsed.data.stressResult.impacted,
      improvements: parsed.data.stressResult.improvements
    } : null
  };
  try {
    const client = new OpenAI({ apiKey: parsed.data.connection.apiKey || process.env.OPENAI_API_KEY || "not-required", baseURL: parsed.data.connection.baseUrl });
    const response = await client.chat.completions.create({
      model: parsed.data.connection.model,
      messages: [
        { role: "system", content: "你是 FIRE 40 家庭财务规划助手。只能依据给出的用户输入、确定性引擎结果以及已有风险/压力测试聚合结果分析。绝对不得自行编造资金充足比例、分位数或压力测试数字；没有风险结果时必须让用户先运行模拟。若结果已过期必须明确提示。回答严格区分：真实数据、模型假设、模拟结果、分析判断、调整建议、缺失信息。不得承诺收益，金额使用人民币。" },
        { role: "user", content: `以下是本次对话持续有效的家庭与计算上下文：${JSON.stringify(compactContext)}` },
        { role: "assistant", content: "已读取当前家庭数据、确定性模拟结果和已保存情景。我会据此回答，并明确说明假设与缺失信息。" },
        ...parsed.data.history,
        { role: "user", content: parsed.data.message }
      ],
      max_tokens: 1600
    });
    return NextResponse.json({ answer: response.choices[0]?.message.content ?? "模型未返回内容" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 请求失败" }, { status: 502 });
  }
}
