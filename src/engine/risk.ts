import { calculateMortgage } from "./mortgage";
import { addMonths, monthToIndex } from "./simulate";
import { baseExpenseAtMonth, lifecycleCashFlowAtMonth } from "./lifecycle";
import { cashBufferMonths, retirementSpending } from "./withdrawal";
import type {
  HouseholdSnapshot, MonteCarloAggregate, MonteCarloInput, PercentilePoint,
  RiskModelSettings, StressEvent, StressImprovement, StressTestSnapshot, WithdrawalComparisonSnapshot, WithdrawalStrategySettings, YearMonth
} from "@/types/finance";

export const RISK_ENGINE_VERSION = "2.1.0";

const cents = (yuan: number) => Math.round(yuan * 100);
const yuan = (value: number) => Math.round(value) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function normalizeEvents(events: StressEvent[]): StressEvent[] {
  return events.map((event) => ({
    ...event,
    durationMonths: event.durationMonths == null ? undefined : Math.max(1, Math.round(event.durationMonths)),
    incomeFactor: event.incomeFactor == null ? undefined : clamp(event.incomeFactor, 0, 1),
    drawdown: event.drawdown == null ? undefined : clamp(event.drawdown, 0, 1),
    recoveryFraction: event.recoveryFraction == null ? undefined : clamp(event.recoveryFraction, 0, 1),
    recoveryMonths: event.recoveryMonths == null ? undefined : Math.max(1, Math.round(event.recoveryMonths)),
    amount: event.amount == null ? undefined : Math.max(0, event.amount),
    expenseIncrease: event.expenseIncrease == null ? undefined : Math.max(0, event.expenseIncrease)
  }));
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(values: Float64Array, probability: number) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))] ?? 0;
}

function point(month: YearMonth, age: number, values: Float64Array): PercentilePoint {
  return {
    month, age, p10: yuan(quantile(values, 0.1)), p25: yuan(quantile(values, 0.25)),
    p50: yuan(quantile(values, 0.5)), p75: yuan(quantile(values, 0.75)), p90: yuan(quantile(values, 0.9))
  };
}

function active(event: StressEvent, offset: number, baseIndex: number) {
  const start = monthToIndex(event.startMonth) - baseIndex;
  return offset >= start && (event.durationMonths == null || offset < start + event.durationMonths);
}

export function retirementMonth(household: HouseholdSnapshot) {
  const male = household.members.find((member) => member.id === "male")!;
  const female = household.members.find((member) => member.id === "female")!;
  const offset = Math.max(
    (household.settings.maleRetirementAge - (male.age ?? 0)) * 12,
    (household.settings.femaleRetirementAge - (female.age ?? 0)) * 12
  );
  return addMonths(household.baseMonth, Math.max(0, offset));
}

export function buildStressPreset(kind: string, household: HouseholdSnapshot): { name: string; events: StressEvent[] } {
  const male = household.members.find((member) => member.id === "male")!;
  const retired = retirementMonth(household);
  const maleJobMonth = addMonths(household.baseMonth, Math.max(0, (37 - (male.age ?? 34)) * 12));
  const event = (type: StressEvent["type"], values: Omit<StressEvent, "id" | "type">): StressEvent => ({ id: `${type}-${kind}`, type, ...values });
  const presets: Record<string, { name: string; events: StressEvent[] }> = {
    "male-job-loss": { name: "男方提前裁员", events: [event("male-job-loss", { startMonth: maleJobMonth, durationMonths: 12, incomeFactor: 0 })] },
    "both-job-loss": { name: "夫妻同时失业", events: [event("both-job-loss", { startMonth: maleJobMonth, durationMonths: 12, incomeFactor: 0 })] },
    "market-crash": { name: "退休初期市场暴跌", events: [event("market-crash", { startMonth: retired, drawdown: 0.3, recoveryFraction: 0.5, recoveryMonths: 36 })] },
    "light-income-loss": { name: "轻工作收入中断", events: [event("light-income-loss", { startMonth: retired, durationMonths: 24, incomeFactor: 0 })] },
    "medical-expense": { name: "重大医疗开支", events: [event("medical-expense", { startMonth: retired, amount: 300000 })] },
    "expense-increase": { name: "家庭生活费上涨", events: [event("expense-increase", { startMonth: retired, expenseIncrease: 0.3 })] },
    combined: { name: "多重风险叠加", events: [
      event("male-job-loss", { startMonth: maleJobMonth, durationMonths: 12, incomeFactor: 0 }),
      event("market-crash", { startMonth: retired, drawdown: 0.3, recoveryFraction: 0.5, recoveryMonths: 36 }),
      event("light-income-loss", { startMonth: retired, incomeFactor: 0.5 })
    ] }
  };
  return presets[kind] ?? presets.combined;
}

export function runMonteCarlo(input: MonteCarloInput, onProgress?: (progress: number) => void): MonteCarloAggregate {
  const { household } = input;
  const settings = {
    ...input.settings,
    annualVolatility: clamp(input.settings.annualVolatility, 0, 2),
    iterations: Math.min(10000, Math.max(1, Math.floor(input.settings.iterations))),
    seed: input.settings.seed >>> 0,
    endAge: Math.min(110, Math.max(80, Math.round(input.settings.endAge)))
  };
  const events = normalizeEvents(input.events);
  const male = household.members.find((member) => member.id === "male")!;
  const female = household.members.find((member) => member.id === "female")!;
  if (male.age == null || female.age == null) throw new Error("夫妻年龄不能为空");
  const youngerAge = Math.min(male.age, female.age);
  const baseIndex = monthToIndex(household.baseMonth);
  const maleRetirementOffset = Math.max(0, (household.settings.maleRetirementAge - male.age) * 12);
  const femaleRetirementOffset = Math.max(0, (household.settings.femaleRetirementAge - female.age) * 12);
  const retirementOffset = Math.max(maleRetirementOffset, femaleRetirementOffset);
  const months = Math.max(1, (settings.endAge - youngerAge) * 12);
  const housingOffset = household.housing.enabled ? monthToIndex(household.housing.purchaseMonth) - baseIndex : -1;
  const annualOffsets = Array.from({ length: Math.floor(months / 12) + 1 }, (_, index) => index * 12);
  const decadeLength = Math.max(0, Math.min(120, months - retirementOffset)) + 1;
  const annualBuckets = annualOffsets.map(() => new Float64Array(settings.iterations));
  const decadeBuckets = Array.from({ length: decadeLength }, () => new Float64Array(settings.iterations));
  const ending = new Float64Array(settings.iterations);
  const drawdowns = new Float64Array(settings.iterations);
  const minimumCash = new Float64Array(settings.iterations);
  const lifestyleStability = new Float64Array(settings.iterations);
  const shortfallCounts = new Map<number, number>();
  let successes = 0;
  const mortgage = household.housing.enabled
    ? calculateMortgage(Math.max(0, household.housing.unitPrice * household.housing.area - household.housing.downPayment), household.housing.loanAnnualRate, household.housing.loanYears, household.housing.loanType)
    : [];
  const sigmaMonth = settings.annualVolatility / Math.sqrt(12);
  const recoveryRates = events.filter((item) => item.type === "market-crash").map((item) => {
    const loss = item.drawdown ?? 0;
    const target = 1 - loss + loss * (item.recoveryFraction ?? 0);
    return { id: item.id, rate: Math.pow(target / Math.max(0.0001, 1 - loss), 1 / Math.max(1, item.recoveryMonths ?? 1)) - 1 };
  });

  for (let run = 0; run < settings.iterations; run += 1) {
    const random = mulberry32((settings.seed + Math.imul(run + 1, 2654435761)) >>> 0);
    let cash = cents(household.accounts.filter((account) => account.category === "cash" && account.retirementUsable).reduce((sum, account) => sum + account.balance, 0));
    let investments = cents(household.accounts.filter((account) => !["cash", "provident", "property", "insurance"].includes(account.category) && account.retirementUsable).reduce((sum, account) => sum + account.balance, 0));
    let provident = cents(household.accounts.filter((account) => account.category === "provident").reduce((sum, account) => sum + account.balance, 0));
    let firstShortfall: number | null = null;
    let minCash = cash;
    let retirementPeak = 0;
    let maxDrawdown = 0;
    let desiredRetirementSpending = 0;
    let actualRetirementSpending = 0;

    for (let offset = 0; offset <= months; offset += 1) {
      if (firstShortfall != null) {
        if (offset % 12 === 0) annualBuckets[offset / 12][run] = 0;
        if (offset >= retirementOffset && offset <= retirementOffset + 120) decadeBuckets[offset - retirementOffset][run] = 0;
        continue;
      }
      if (offset === retirementOffset) retirementPeak = investments;
      const years = offset / 12;
      const inflation = Math.pow(1 + household.settings.inflationRate, years);
      const bothRetiredAtStart = offset >= maleRetirementOffset && offset >= femaleRetirementOffset;
      const expected = household.settings.mode === "fixed"
        ? household.settings.annualReturn
        : bothRetiredAtStart ? household.settings.retirementReturn : offset >= Math.max(0, retirementOffset - 24) ? household.settings.transitionReturn : household.settings.annualReturn;
      const muMonth = Math.log1p(expected) / 12 - 0.5 * sigmaMonth * sigmaMonth;
      const randomReturn = Math.exp(muMonth + sigmaMonth * normal(random)) - 1;
      investments = Math.max(0, Math.round(investments * (1 + randomReturn)));

      for (const item of events) {
        const start = monthToIndex(item.startMonth) - baseIndex;
        if (item.type === "market-crash" && offset === start) investments = Math.round(investments * (1 - Math.min(1, Math.max(0, item.drawdown ?? 0))));
        if (item.type === "market-crash" && offset > start && offset <= start + (item.recoveryMonths ?? 0)) {
          const recovery = recoveryRates.find((value) => value.id === item.id)?.rate ?? 0;
          investments = Math.round(investments * (1 + recovery));
        }
      }
      if (offset >= retirementOffset) retirementPeak = Math.max(retirementPeak, investments);
      const currentDrawdown = offset >= retirementOffset && retirementPeak > 0 ? 1 - investments / retirementPeak : 0;

      const maleRetired = offset >= maleRetirementOffset;
      const femaleRetired = offset >= femaleRetirementOffset;
      const bothRetired = maleRetired && femaleRetired;
      let maleIncome = maleRetired ? household.settings.maleLightIncome : male.monthlyIncome;
      let femaleIncome = femaleRetired ? household.settings.femaleLightIncome : female.monthlyIncome;
      const lifecycleFlow = lifecycleCashFlowAtMonth(household, offset);
      for (const item of events) {
        if (!active(item, offset, baseIndex)) continue;
        if (item.type === "male-job-loss" && !maleRetired) maleIncome *= item.incomeFactor ?? 0;
        if (item.type === "both-job-loss" && !bothRetired) { maleIncome = maleRetired ? maleIncome : maleIncome * (item.incomeFactor ?? 0); femaleIncome = femaleRetired ? femaleIncome : femaleIncome * (item.incomeFactor ?? 0); }
        if (item.type === "light-income-loss") { if (maleRetired) maleIncome *= item.incomeFactor ?? 0; if (femaleRetired) femaleIncome *= item.incomeFactor ?? 0; }
      }
      cash += cents(maleIncome + femaleIncome + lifecycleFlow.pensionIncome);
      if (!maleRetired) provident += cents(male.providentContribution);
      if (!femaleRetired) provident += cents(female.providentContribution);

      if (offset === housingOffset) {
        const providentUsed = Math.min(provident, cents(household.housing.providentWithdrawal));
        provident -= providentUsed;
        let cost = Math.max(0, cents(household.housing.downPayment + household.housing.renovation + household.housing.otherCosts) - providentUsed);
        const fromCash = Math.min(cash, cost); cash -= fromCash; cost -= fromCash;
        const fromInvestments = Math.min(investments, cost); investments -= fromInvestments; cost -= fromInvestments;
        if (cost > 0 && firstShortfall == null) firstShortfall = offset;
      }
      if (offset === retirementOffset && household.accounts.some((account) => account.category === "provident" && account.retirementUsable)) {
        investments += provident; provident = 0;
      }

      const retirementBudget = bothRetired ? retirementSpending(household, inflation, investments / 100, maleIncome + femaleIncome + lifecycleFlow.pensionIncome, currentDrawdown) : null;
      let expense = retirementBudget
        ? retirementBudget.expense
        : baseExpenseAtMonth(household, offset);
      if (retirementBudget) desiredRetirementSpending += retirementBudget.desired;
      for (const item of events) if (item.type === "expense-increase" && active(item, offset, baseIndex)) expense *= 1 + (item.expenseIncrease ?? 0);
      let required = cents(expense + lifecycleFlow.lifecycleExpense + lifecycleFlow.protectionExpense) + cents(housingOffset >= 0 && offset >= housingOffset ? mortgage[offset - housingOffset]?.payment ?? 0 : 0);
      for (const item of events) if (item.type === "medical-expense" && offset === monthToIndex(item.startMonth) - baseIndex) required += cents(item.amount ?? 0);
      const fromCash = Math.min(cash, required); cash -= fromCash; required -= fromCash;
      const withdrawalLimit = retirementBudget?.investmentLimit == null ? investments : Math.min(investments, cents(retirementBudget.investmentLimit));
      const withdrawn = Math.min(withdrawalLimit, required); investments -= withdrawn; required -= withdrawn;
      if (retirementBudget) actualRetirementSpending += Math.max(0, retirementBudget.expense - required / 100);
      if (required > 0 && firstShortfall == null) firstShortfall = offset;
      const buffer = Math.round(cents(expense + lifecycleFlow.lifecycleExpense + lifecycleFlow.protectionExpense + (housingOffset >= 0 && offset >= housingOffset ? mortgage[offset - housingOffset]?.payment ?? 0 : 0)) * cashBufferMonths(household));
      if (cash > buffer) { investments += cash - buffer; cash = buffer; }
      minCash = Math.min(minCash, cash);
      if (offset >= retirementOffset) {
        if (retirementPeak > 0) maxDrawdown = Math.max(maxDrawdown, 1 - investments / retirementPeak);
      }
      const available = cash + investments;
      if (offset % 12 === 0) annualBuckets[offset / 12][run] = available;
      if (offset >= retirementOffset && offset <= retirementOffset + 120) decadeBuckets[offset - retirementOffset][run] = available;
    }
    ending[run] = cash + investments;
    drawdowns[run] = maxDrawdown;
    minimumCash[run] = minCash;
    lifestyleStability[run] = desiredRetirementSpending > 0 ? actualRetirementSpending / desiredRetirementSpending : 1;
    if (firstShortfall == null) successes += 1;
    else {
      const age = Math.floor(youngerAge + firstShortfall / 12);
      shortfallCounts.set(age, (shortfallCounts.get(age) ?? 0) + 1);
    }
    if (run % 250 === 0) onProgress?.(run / settings.iterations);
  }

  const annualPaths = annualBuckets.map((values, index) => point(addMonths(household.baseMonth, annualOffsets[index]), youngerAge + annualOffsets[index] / 12, values));
  const retirementDecadePaths = decadeBuckets.map((values, index) => {
    const value = point(addMonths(household.baseMonth, retirementOffset + index), youngerAge + (retirementOffset + index) / 12, values);
    return { month: value.month, age: value.age, p10: value.p10, p50: value.p50, p90: value.p90 };
  });
  const shortfallByAge = [...shortfallCounts].sort((a, b) => a[0] - b[0]).map(([age, count]) => ({ age, count, percentage: count / settings.iterations }));
  const mostCommon = shortfallByAge.reduce<typeof shortfallByAge[number] | null>((best, item) => !best || item.count > best.count ? item : best, null);
  onProgress?.(1);
  return {
    fundingRatio: successes / settings.iterations,
    medianEndingAssets: yuan(quantile(ending, 0.5)), p10EndingAssets: yuan(quantile(ending, 0.1)),
    mostCommonShortfallAge: mostCommon?.age ?? null, maxDrawdownMedian: quantile(drawdowns, 0.5),
    minimumCashP10: yuan(quantile(minimumCash, 0.1)), lifestyleStabilityMedian: quantile(lifestyleStability, 0.5), annualPaths, retirementDecadePaths, shortfallByAge
  };
}

function adjustedHousehold(input: HouseholdSnapshot, id: StressImprovement["id"]) {
  const household = structuredClone(input);
  let applicable = true;
  let note: string | undefined;
  if (id === "reduce-expense") {
    const currentTotal = household.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
    if (currentTotal < 2000 || household.settings.retirementMonthlyExpense < 2000) {
      applicable = false;
      note = "当前支出不足以完整减少 2,000 元";
    } else {
      household.settings.retirementMonthlyExpense -= 2000;
      let remaining = 2000;
      for (const id of ["other", "living", "rent"]) {
        const expense = household.expenses.find((item) => item.id === id);
        if (!expense) continue;
        const reduction = Math.min(expense.monthlyAmount, remaining);
        expense.monthlyAmount -= reduction;
        remaining -= reduction;
        if (remaining === 0) break;
      }
      if (remaining > 0) {
        for (const expense of household.expenses) {
          const reduction = Math.min(expense.monthlyAmount, remaining);
          expense.monthlyAmount -= reduction;
          remaining -= reduction;
          if (remaining === 0) break;
        }
      }
    }
  }
  if (id === "increase-income") { household.settings.maleLightIncome += 1500; household.settings.femaleLightIncome += 1500; }
  if (id === "delay-retirement") {
    if (Math.max(household.settings.maleRetirementAge, household.settings.femaleRetirementAge) + 2 > 65) {
      applicable = false;
      note = "共同退休年龄延后两年会超过 65 岁边界";
    } else {
      household.settings.maleRetirementAge += 2;
      household.settings.femaleRetirementAge += 2;
    }
  }
  return { household, applicable, note };
}

function shiftRetirementEvents(events: StressEvent[], from: YearMonth, to: YearMonth) {
  const shift = monthToIndex(to) - monthToIndex(from);
  if (shift === 0) return events;
  return events.map((event) => event.startMonth === from ? { ...event, startMonth: addMonths(event.startMonth, shift) } : event);
}

export function runStressComparison(name: string, household: HouseholdSnapshot, settings: RiskModelSettings, events: StressEvent[], onProgress?: (progress: number) => void): StressTestSnapshot {
  const baseline = runMonteCarlo({ household, settings, events: [] }, (value) => onProgress?.(value * 0.38));
  const impacted = runMonteCarlo({ household, settings, events }, (value) => onProgress?.(0.38 + value * 0.38));
  const quickSettings = { ...settings, iterations: 1000 };
  const impactedQuick = settings.iterations === 1000 ? impacted : runMonteCarlo({ household, settings: quickSettings, events });
  const definitions: { id: StressImprovement["id"]; label: string }[] = [
    { id: "reduce-expense", label: "每月支出减少 2,000 元" },
    { id: "increase-income", label: "轻工作收入增加 3,000 元" },
    { id: "delay-retirement", label: "共同退休延后两年" }
  ];
  const improvements = definitions.map((item, index) => {
    const adjustment = adjustedHousehold(household, item.id);
    if (!adjustment.applicable) {
      onProgress?.(0.76 + (index + 1) * 0.07);
      return { ...item, applicable: false, note: adjustment.note, fundingRatio: impactedQuick.fundingRatio, change: 0 };
    }
    const adjustedEvents = item.id === "delay-retirement" ? shiftRetirementEvents(events, retirementMonth(household), retirementMonth(adjustment.household)) : events;
    const result = runMonteCarlo({ household: adjustment.household, settings: quickSettings, events: adjustedEvents });
    onProgress?.(0.76 + (index + 1) * 0.07);
    return { ...item, applicable: true, fundingRatio: result.fundingRatio, change: result.fundingRatio - impactedQuick.fundingRatio };
  });
  let safeRetirementAge: number | null = null;
  for (let age = Math.max(household.settings.maleRetirementAge, household.settings.femaleRetirementAge); age <= 65; age += 1) {
    const candidate = structuredClone(household); candidate.settings.maleRetirementAge = age; candidate.settings.femaleRetirementAge = age;
    const candidateEvents = shiftRetirementEvents(events, retirementMonth(household), retirementMonth(candidate));
    const result = runMonteCarlo({ household: candidate, settings: { ...settings, annualVolatility: 0, iterations: 1 }, events: candidateEvents });
    if (result.fundingRatio === 1) { safeRetirementAge = age; break; }
  }
  return {
    id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), householdUpdatedAt: household.updatedAt,
    engineVersion: RISK_ENGINE_VERSION, runtimeMs: 0, seed: settings.seed, events,
    input: { household: structuredClone(household), settings: structuredClone(settings), events: structuredClone(events) },
    baseline, impacted, safeRetirementAge, improvements
  };
}

export function runWithdrawalComparison(household: HouseholdSnapshot, settings: RiskModelSettings, onProgress?: (progress: number) => void): WithdrawalComparisonSnapshot {
  const strategies: { type: WithdrawalStrategySettings["type"]; label: string }[] = [
    { type: "fixed-real", label: "固定实际金额" },
    { type: "fixed-percent", label: "固定资产比例" },
    { type: "flexible", label: "弹性支出调整" },
    { type: "cash-buffer", label: "现金缓冲提取" }
  ];
  const quickSettings = { ...settings, iterations: 1000 };
  const results = strategies.map((strategy, index) => {
    const input = structuredClone(household);
    input.withdrawalStrategy = { ...input.withdrawalStrategy, type: strategy.type };
    const aggregate = runMonteCarlo({ household: input, settings: quickSettings, events: [] }, (value) => onProgress?.((index + value) / strategies.length));
    return { ...strategy, aggregate };
  });
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), householdUpdatedAt: household.updatedAt, engineVersion: RISK_ENGINE_VERSION, runtimeMs: 0, seed: settings.seed, input: { household: structuredClone(household), settings: structuredClone(settings) }, results };
}
