import Decimal from "decimal.js";

export interface MortgagePayment {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2).toNumber();

export function calculateMortgage(
  principal: number,
  annualRate: number,
  years: number,
  type: "equal-payment" | "equal-principal"
): MortgagePayment[] {
  if (principal < 0 || annualRate < 0 || years <= 0) throw new Error("房贷参数无效");
  const months = years * 12;
  const p = new Decimal(principal);
  const rate = new Decimal(annualRate).div(12);
  const fixedPrincipal = p.div(months);
  const fixedPayment = rate.eq(0)
    ? fixedPrincipal
    : p.mul(rate).mul(rate.plus(1).pow(months)).div(rate.plus(1).pow(months).minus(1));
  let balance = p;

  return Array.from({ length: months }, (_, index) => {
    const interest = balance.mul(rate);
    const principalPart = type === "equal-payment" ? fixedPayment.minus(interest) : fixedPrincipal;
    const appliedPrincipal = Decimal.min(balance, principalPart);
    const payment = appliedPrincipal.plus(interest);
    balance = Decimal.max(0, balance.minus(appliedPrincipal));
    return {
      month: index + 1,
      payment: money(payment),
      principal: money(appliedPrincipal),
      interest: money(interest),
      balance: money(balance)
    };
  });
}
