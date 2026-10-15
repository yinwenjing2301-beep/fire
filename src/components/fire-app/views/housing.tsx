"use client";

import type { HouseholdSnapshot, SimulationResult } from "@/types/finance";
import { Field, PageIntro, Panel, clone, money } from "../ui";
export function Housing({ household, result, change }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void }) {
  const set = (key: keyof HouseholdSnapshot["housing"], value: number | boolean | string) => { const next = clone(household); (next.housing as unknown as Record<string, unknown>)[key] = value; change(next); };
  const total = household.housing.unitPrice * household.housing.area;
  const loan = Math.max(0, total - household.housing.downPayment);
  const firstMortgage = result.ledger.find((item) => item.mortgage > 0)?.mortgage ?? 0;
  return <>
    <PageIntro eyebrow="住房规划" title="一套房，不该遮住生活本身。" copy="把昆明买房的现金消耗、长期月供和购房后缓冲放在同一张账上。" />
    <div className="split-grid"><Panel title="昆明 · 100㎡ 计划"><div className="toggle-row"><span>纳入当前方案</span><button aria-label="切换购房计划" className={`toggle ${household.housing.enabled ? "on" : ""}`} onClick={() => set("enabled", !household.housing.enabled)}><i/></button></div><div className="expense-grid"><Field label="房屋单价" value={household.housing.unitPrice} suffix="元/㎡" onChange={(v) => set("unitPrice", v)}/><Field label="面积" value={household.housing.area} suffix="㎡" onChange={(v) => set("area", v)}/><Field label="首付" value={household.housing.downPayment} suffix="元" onChange={(v) => set("downPayment", v)}/><Field label="装修" value={household.housing.renovation} suffix="元" onChange={(v) => set("renovation", v)}/><Field label="税费与家具" value={household.housing.otherCosts} suffix="元" onChange={(v) => set("otherCosts", v)}/><Field label="公积金提取" value={household.housing.providentWithdrawal} suffix="元" onChange={(v) => set("providentWithdrawal", v)}/><Field label="贷款年利率" value={household.housing.loanAnnualRate * 100} suffix="%" step={0.01} onChange={(v) => set("loanAnnualRate", v / 100)}/><Field label="贷款期限" value={household.housing.loanYears} suffix="年" onChange={(v) => set("loanYears", v)}/></div></Panel>
      <div><div className="house-card"><span>预计房屋总价</span><strong>{money(total)}</strong><div><p><small>贷款本金</small>{money(loan)}</p><p><small>首月月供</small>{money(firstMortgage)}</p></div><hr/><p><small>购房后金融资产</small><b>{money(result.summary.afterPurchaseAssets)}</b></p></div><Panel title="公积金使用说明"><p className="muted">提取只在购房月份发生，实际使用额不会超过当时账户余额。提取后余额同步减少，不会同时计入首付与资产。</p></Panel></div></div>
  </>;
}