import type { HouseholdSnapshot } from "@/types/finance";

export function retirementSpending(
  household: HouseholdSnapshot,
  inflation: number,
  availableInvestments: number,
  retirementIncome: number,
  drawdown: number
) {
  const strategy = household.withdrawalStrategy;
  const desired = household.settings.retirementMonthlyExpense * inflation;
  if (!strategy || strategy.type === "fixed-real" || strategy.type === "cash-buffer") return { expense: desired, desired, investmentLimit: null as number | null };
  const necessary = strategy.necessaryMonthlyExpense * inflation;
  const discretionary = strategy.discretionaryMonthlyExpense * inflation;
  if (strategy.type === "flexible") {
    const expense = necessary + discretionary * (drawdown >= strategy.drawdownTrigger ? 1 - strategy.discretionaryReduction : 1);
    return { expense, desired: necessary + discretionary, investmentLimit: null as number | null };
  }
  const investmentLimit = Math.max(0, availableInvestments * strategy.annualRate / 12);
  const expense = Math.max(necessary, Math.min(necessary + discretionary, retirementIncome + investmentLimit));
  return { expense, desired: necessary + discretionary, investmentLimit };
}

export function cashBufferMonths(household: HouseholdSnapshot) {
  return household.withdrawalStrategy?.type === "cash-buffer"
    ? household.withdrawalStrategy.cashBufferMonths
    : household.settings.cashBufferMonths;
}
