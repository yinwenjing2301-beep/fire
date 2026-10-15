import Decimal from "decimal.js";
import { calculateMortgage } from "./mortgage";
import { baseExpenseActive, lifecycleCashFlowAtMonth } from "./lifecycle";
import { cashBufferMonths, retirementSpending } from "./withdrawal";
import type { HouseholdSnapshot, MonthlyLedgerEntry, RiskFinding, SimulationResult, YearMonth } from "@/types/finance";

export const ENGINE_VERSION = "1.0.0";

const D = (value: Decimal.Value) => new Decimal(value);
const amount = (value: Decimal.Value) => D(value).toDecimalPlaces(2).toNumber();

export function monthToIndex(month: YearMonth): number {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

export function indexToMonth(index: number): YearMonth {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}` as YearMonth;
}

export function addMonths(month: YearMonth, count: number): YearMonth {
  return indexToMonth(monthToIndex(month) + count);
}

function monthlyRate(annualRate: number): Decimal {
  return D(1).plus(annualRate).pow(D(1).div(12)).minus(1);
}

function buildRisks(input: HouseholdSnapshot, result: SimulationResult): RiskFinding[] {
  const risks: RiskFinding[] = [];
  const annualExpense = input.settings.retirementMonthlyExpense * 12;
  const investable = result.summary.investableNow;
  const cash = input.accounts.filter((a) => a.category === "cash").reduce((sum, a) => sum + a.balance, 0);
  const currentExpense = input.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
  if (cash < currentExpense * 6) risks.push({ id: "cash", level: "critical", title: "现金缓冲偏低", detail: "当前现金不足覆盖 6 个月家庭支出。" });
  if (result.summary.firstShortfallMonth) risks.push({ id: "shortfall", level: "critical", title: "规划期内资金不足", detail: `预计最早在 ${result.summary.firstShortfallMonth} 出现无法覆盖的资金缺口。` });
  if (investable < annualExpense / input.settings.withdrawalRate) risks.push({ id: "target", level: "warning", title: "尚未达到静态 FIRE 门槛", detail: "当前可投资资产低于按提取率计算的静态目标。" });
  if (input.accounts.some((a) => a.category === "insurance" && a.note?.includes("待补充"))) risks.push({ id: "insurance", level: "info", title: "保险现金价值待补充", detail: "已缴保费没有计入退休本金，补充现金价值后结果会更完整。" });
  if ((input.lifecycle ?? []).some((rule) => rule.mode === "additional" && rule.monthlyAmount == null && rule.annualAmount == null && rule.oneTimeAmount == null)) risks.push({ id: "lifecycle", level: "info", title: "阶段性支出待补充", detail: "部分教育、医疗或照护阶段尚未填写金额，目前没有进入长期现金流。" });
  if ((input.socialSecurity ?? []).some((plan) => plan.medicalCoverage === "unknown")) risks.push({ id: "medical-cover", level: "warning", title: "医保衔接方式待确认", detail: "退出全职后的医保方案尚未确认，模型暂未估算相关缴费与保障缺口。" });
  if ((input.socialSecurity ?? []).some((plan) => !plan.pensionConfirmed)) risks.push({ id: "pension", level: "info", title: "养老金尚未纳入", detail: "未确认的养老金保持未知，不会自动作为退休收入。" });
  const lightIncome = input.settings.maleLightIncome + input.settings.femaleLightIncome;
  if (lightIncome > input.settings.retirementMonthlyExpense * 0.7) risks.push({ id: "light-work", level: "warning", title: "较依赖轻工作收入", detail: "轻工作收入覆盖退休生活费的 70% 以上，建议同时查看零工作收入情景。" });
  return risks;
}

export function runSimulation(input: HouseholdSnapshot): SimulationResult {
  const started = performance.now();
  const baseIndex = monthToIndex(input.baseMonth);
  const male = input.members.find((m) => m.id === "male") ?? input.members[0];
  const female = input.members.find((m) => m.id === "female") ?? input.members[1];
  if (male.age == null || female.age == null) throw new Error("夫妻年龄不能为空");

  const maleRetirementOffset = Math.max(0, (input.settings.maleRetirementAge - male.age) * 12);
  const femaleRetirementOffset = Math.max(0, (input.settings.femaleRetirementAge - female.age) * 12);
  const retirementOffset = Math.max(maleRetirementOffset, femaleRetirementOffset);
  const retirementMonth = addMonths(input.baseMonth, retirementOffset);
  const months = Math.max(1, (input.settings.endAge - Math.min(male.age, female.age)) * 12);
  const housingOffset = input.housing.enabled ? monthToIndex(input.housing.purchaseMonth) - baseIndex : -1;
  const shockOffset = input.settings.shock ? monthToIndex(input.settings.shock.month) - baseIndex : -1;
  const jobLossOffset = input.settings.maleJobLossMonth ? monthToIndex(input.settings.maleJobLossMonth) - baseIndex : -1;

  let cash = D(input.accounts.filter((a) => a.category === "cash" && a.retirementUsable).reduce((s, a) => s + a.balance, 0));
  let investments = D(input.accounts.filter((a) => !["cash", "provident", "property", "insurance"].includes(a.category) && a.retirementUsable).reduce((s, a) => s + a.balance, 0));
  let provident = D(input.accounts.filter((a) => a.category === "provident").reduce((s, a) => s + a.balance, 0));
  let property = D(input.accounts.filter((a) => a.category === "property").reduce((s, a) => s + a.balance, 0));
  let debt = D(0);
  const investableNow = cash.plus(investments).toNumber();
  const housePrice = D(input.housing.unitPrice).mul(input.housing.area);
  const loanPrincipal = Decimal.max(0, housePrice.minus(input.housing.downPayment));
  const mortgage = input.housing.enabled ? calculateMortgage(loanPrincipal.toNumber(), input.housing.loanAnnualRate, input.housing.loanYears, input.housing.loanType) : [];

  let retirementAssets: number | null = null;
  let afterPurchaseAssets: number | null = null;
  let firstShortfallMonth: YearMonth | null = null;
  let firstYearWithdrawal = D(0);
  let minimumCash = cash;
  let retirementPeak = D(0);
  const ledger: MonthlyLedgerEntry[] = [];

  for (let offset = 0; offset <= months; offset += 1) {
    const month = addMonths(input.baseMonth, offset);
    const maleJobless = jobLossOffset >= 0 && offset >= jobLossOffset && offset < jobLossOffset + (input.settings.maleJobLossMonths ?? Number.POSITIVE_INFINITY);
    const maleRetired = offset >= maleRetirementOffset;
    const femaleRetired = offset >= femaleRetirementOffset;
    const bothRetired = maleRetired && femaleRetired;
    const yearsElapsed = D(offset).div(12);
    const inflationFactor = D(1).plus(input.settings.inflationRate).pow(yearsElapsed);
    const annualReturn = input.settings.mode === "fixed"
      ? input.settings.annualReturn
      : bothRetired ? input.settings.retirementReturn : offset >= Math.max(0, retirementOffset - 24) ? input.settings.transitionReturn : input.settings.annualReturn;
    investments = investments.mul(monthlyRate(annualReturn).plus(1));
    if (offset === shockOffset) investments = investments.mul(D(1).minus(input.settings.shock!.drawdown));
    if (offset >= retirementOffset) retirementPeak = Decimal.max(retirementPeak, investments);
    const drawdown = retirementPeak.gt(0) ? D(1).minus(investments.div(retirementPeak)).toNumber() : 0;

    let workIncome = D(0);
    let lightIncome = D(0);
    const lifecycleFlow = lifecycleCashFlowAtMonth(input, offset);
    if (!maleRetired) {
      if (!maleJobless) workIncome = workIncome.plus(male.monthlyIncome);
    } else lightIncome = lightIncome.plus(input.settings.maleLightIncome);
    if (!femaleRetired) workIncome = workIncome.plus(female.monthlyIncome);
    else lightIncome = lightIncome.plus(input.settings.femaleLightIncome);
    cash = cash.plus(workIncome).plus(lightIncome).plus(lifecycleFlow.pensionIncome);
    if (!maleRetired) provident = provident.plus(male.providentContribution);
    if (!femaleRetired) provident = provident.plus(female.providentContribution);

    if (offset === housingOffset) {
      const providentUsed = Decimal.min(provident, input.housing.providentWithdrawal);
      provident = provident.minus(providentUsed);
      const cashCost = D(input.housing.downPayment).plus(input.housing.renovation).plus(input.housing.otherCosts).minus(providentUsed);
      const fromCash = Decimal.min(cash, Decimal.max(0, cashCost));
      cash = cash.minus(fromCash);
      const remaining = Decimal.max(0, cashCost.minus(fromCash));
      const fromInvestments = Decimal.min(investments, remaining);
      investments = investments.minus(fromInvestments);
      const housingShortfall = remaining.minus(fromInvestments);
      if (housingShortfall.gt(0) && firstShortfallMonth == null) firstShortfallMonth = month;
      property = property.plus(housePrice);
      debt = debt.plus(loanPrincipal);
      afterPurchaseAssets = amount(cash.plus(investments));
    }

    if (offset === retirementOffset && input.accounts.some((account) => account.category === "provident" && account.retirementUsable)) {
      investments = investments.plus(provident);
      provident = D(0);
    }

    const retirementBudget = bothRetired ? retirementSpending(input, inflationFactor.toNumber(), investments.toNumber(), lightIncome.toNumber() + lifecycleFlow.pensionIncome, drawdown) : null;
    const regularExpense = retirementBudget
      ? D(retirementBudget.expense)
      : input.expenses.filter((item) => baseExpenseActive(input, item.id, offset)).reduce((sum, item) => sum.plus(D(item.monthlyAmount).mul(D(1).plus(item.inflationRate).pow(yearsElapsed))), D(0));
    const expense = regularExpense.plus(lifecycleFlow.lifecycleExpense).plus(lifecycleFlow.protectionExpense);
    const mortgageEntry = housingOffset >= 0 && offset >= housingOffset ? mortgage[offset - housingOffset] : undefined;
    const mortgagePayment = D(mortgageEntry?.payment ?? 0);
    if (mortgageEntry) debt = D(mortgageEntry.balance);
    const required = expense.plus(mortgagePayment);
    const fromCash = Decimal.min(cash, required);
    cash = cash.minus(fromCash);
    let remaining = required.minus(fromCash);
    const withdrawalLimit = retirementBudget?.investmentLimit == null ? investments : Decimal.min(investments, retirementBudget.investmentLimit);
    const withdrawn = Decimal.min(withdrawalLimit, remaining);
    investments = investments.minus(withdrawn);
    remaining = remaining.minus(withdrawn);
    if (remaining.gt(0) && firstShortfallMonth == null) firstShortfallMonth = month;
    if (offset >= retirementOffset && offset < retirementOffset + 12) firstYearWithdrawal = firstYearWithdrawal.plus(withdrawn);

    const buffer = expense.plus(mortgagePayment).mul(cashBufferMonths(input));
    if (cash.gt(buffer)) {
      investments = investments.plus(cash.minus(buffer));
      cash = buffer;
    }
    minimumCash = Decimal.min(minimumCash, cash);
    if (offset === retirementOffset) retirementAssets = amount(cash.plus(investments));

    ledger.push({
      month,
      youngerAge: Math.min(male.age, female.age) + offset / 12,
      cash: amount(cash), investments: amount(investments), provident: amount(provident),
      property: amount(property), debt: amount(debt), netWorth: amount(cash.plus(investments).plus(provident).plus(property).minus(debt)),
      workIncome: amount(workIncome), lightIncome: amount(lightIncome), expense: amount(expense),
      mortgage: amount(mortgagePayment), withdrawal: amount(withdrawn), shortfall: amount(remaining),
      pensionIncome: amount(lifecycleFlow.pensionIncome), lifecycleExpense: amount(lifecycleFlow.lifecycleExpense), protectionExpense: amount(lifecycleFlow.protectionExpense),
      spendingCut: amount(retirementBudget ? Math.max(0, retirementBudget.desired - retirementBudget.expense) : 0)
    });
  }

  const summary = {
    investableNow: amount(investableNow), retirementAssets, afterPurchaseAssets,
    fireTarget: amount(D(input.settings.retirementMonthlyExpense).mul(12).minus(D(input.settings.maleLightIncome + input.settings.femaleLightIncome).mul(12)).div(input.settings.withdrawalRate)),
    firstYearWithdrawal: amount(firstYearWithdrawal), minimumCash: amount(minimumCash), firstShortfallMonth,
    endingAssets: amount(cash.plus(investments)), retirementMonth, runtimeMs: Math.round((performance.now() - started) * 100) / 100
  };
  const result: SimulationResult = { engineVersion: ENGINE_VERSION, summary, ledger, risks: [] };
  result.risks = buildRisks(input, result);
  return result;
}
