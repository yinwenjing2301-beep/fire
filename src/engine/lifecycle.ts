import type { HouseholdSnapshot, LifecycleExpenseRule, YearMonth } from "@/types/finance";

const monthToIndex = (month: YearMonth) => {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
};
const addMonths = (month: YearMonth, count: number) => {
  const index = monthToIndex(month) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}` as YearMonth;
};

function active(rule: LifecycleExpenseRule, monthIndex: number) {
  const start = monthToIndex(rule.startMonth);
  const end = rule.endMonth ? monthToIndex(rule.endMonth) : Number.POSITIVE_INFINITY;
  return monthIndex >= start && monthIndex <= end;
}

export function baseExpenseActive(household: HouseholdSnapshot, expenseId: string, offset: number) {
  const controls = (household.lifecycle ?? []).filter((rule) => rule.mode === "included" && rule.sourceExpenseId === expenseId);
  if (!controls.length) return true;
  const monthIndex = monthToIndex(addMonths(household.baseMonth, offset));
  return controls.some((rule) => active(rule, monthIndex));
}

export function baseExpenseAtMonth(household: HouseholdSnapshot, offset: number) {
  const years = offset / 12;
  return household.expenses.filter((item) => baseExpenseActive(household, item.id, offset)).reduce((sum, item) => sum + item.monthlyAmount * Math.pow(1 + item.inflationRate, years), 0);
}

export function lifecycleCashFlowAtMonth(household: HouseholdSnapshot, offset: number) {
  const monthIndex = monthToIndex(addMonths(household.baseMonth, offset));
  let lifecycleExpense = 0;
  for (const rule of household.lifecycle ?? []) {
    if (rule.mode !== "additional" || !active(rule, monthIndex)) continue;
    const elapsedYears = Math.max(0, (monthIndex - monthToIndex(rule.startMonth)) / 12);
    const inflation = Math.pow(1 + rule.inflationRate, elapsedYears);
    lifecycleExpense += (rule.monthlyAmount ?? 0) * inflation;
    if ((monthIndex - monthToIndex(rule.startMonth)) % 12 === 0) lifecycleExpense += (rule.annualAmount ?? 0) * inflation;
    if (monthIndex === monthToIndex(rule.startMonth)) lifecycleExpense += rule.oneTimeAmount ?? 0;
  }

  let pensionIncome = 0;
  let protectionExpense = 0;
  for (const plan of household.socialSecurity ?? []) {
    const member = household.members.find((item) => item.id === plan.memberId);
    if (!member || member.age == null) continue;
    const pensionOffset = plan.pensionStartAge == null ? null : Math.max(0, (plan.pensionStartAge - member.age) * 12);
    const exitAge = plan.memberId === "male" ? household.settings.maleRetirementAge : household.settings.femaleRetirementAge;
    const workExitOffset = Math.max(0, (exitAge - member.age) * 12);
    if (plan.pensionConfirmed && plan.estimatedMonthlyPension != null && pensionOffset != null && offset >= pensionOffset) pensionIncome += plan.estimatedMonthlyPension;
    if (plan.continueContributions && plan.monthlyContribution != null && offset >= workExitOffset && (pensionOffset == null || offset < pensionOffset)) protectionExpense += plan.monthlyContribution;
    if (plan.annualCommercialPremium != null && offset % 12 === 0) protectionExpense += plan.annualCommercialPremium;
  }
  return { lifecycleExpense, pensionIncome, protectionExpense };
}

export function lifecycleYearSummary(household: HouseholdSnapshot, yearOffset: number) {
  let lifecycleExpense = 0;
  let pensionIncome = 0;
  let protectionExpense = 0;
  for (let month = yearOffset * 12; month < yearOffset * 12 + 12; month += 1) {
    const flow = lifecycleCashFlowAtMonth(household, month);
    lifecycleExpense += flow.lifecycleExpense;
    pensionIncome += flow.pensionIncome;
    protectionExpense += flow.protectionExpense;
  }
  return { lifecycleExpense, pensionIncome, protectionExpense };
}
