"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HouseholdSnapshot, SimulationResult } from "@/types/finance";
import { Field, Metric, PageIntro, Panel, clone, money } from "../ui";
export function Simulator({ household, result, change }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void }) {
  const set = (key: keyof HouseholdSnapshot["settings"], value: number) => { const next = clone(household); (next.settings[key] as number) = value; change(next); };
  const yearly = result.ledger.filter((_, i) => i % 12 === 0).map((item) => ({ age: Math.round(item.youngerAge), 投资资产: Math.round(item.investments / 10000), 现金: Math.round(item.cash / 10000), 房贷余额: Math.round(item.debt / 10000) }));
  return <>
    <PageIntro eyebrow="FIRE 模拟器" title="把“如果”变成一条看得见的曲线。" copy={`本次模拟用时 ${result.summary.runtimeMs}ms · 引擎 ${result.engineVersion} · 结果按月计算`} />
    <div className="sim-grid">
      <Panel title="规划假设" className="sticky-panel">
        <div className="form-stack">
          <label className="field"><span>回报模式</span><select value={household.settings.mode} onChange={(event) => { const next = clone(household); next.settings.mode = event.target.value as "fixed" | "phased"; change(next); }}><option value="fixed">固定回报</option><option value="phased">分阶段回报</option></select></label>
          <Field label="年化投资回报" value={household.settings.annualReturn * 100} suffix="%" step={0.1} onChange={(v) => set("annualReturn", v / 100)} />
          {household.settings.mode === "phased" && <><Field label="过渡期年化回报" value={household.settings.transitionReturn * 100} suffix="%" step={0.1} onChange={(v) => set("transitionReturn", v / 100)} /><Field label="退休后年化回报" value={household.settings.retirementReturn * 100} suffix="%" step={0.1} onChange={(v) => set("retirementReturn", v / 100)} /></>}
          <Field label="年度通胀" value={household.settings.inflationRate * 100} suffix="%" step={0.1} onChange={(v) => set("inflationRate", v / 100)} />
          <Field label="男方退出全职年龄" value={household.settings.maleRetirementAge} suffix="岁" onChange={(v) => set("maleRetirementAge", v)} />
          <Field label="女方退出全职年龄" value={household.settings.femaleRetirementAge} suffix="岁" onChange={(v) => set("femaleRetirementAge", v)} />
          <Field label="退休后生活费" value={household.settings.retirementMonthlyExpense} suffix="元/月" onChange={(v) => set("retirementMonthlyExpense", v)} />
          <Field label="男方轻工作收入" value={household.settings.maleLightIncome} suffix="元/月" onChange={(v) => set("maleLightIncome", v)} />
          <Field label="女方轻工作收入" value={household.settings.femaleLightIncome} suffix="元/月" onChange={(v) => set("femaleLightIncome", v)} />
          <Field label="现金缓冲" value={household.settings.cashBufferMonths} suffix="个月" onChange={(v) => set("cashBufferMonths", v)} />
        </div>
      </Panel>
      <div className="sim-results">
        <div className="metric-grid compact"><Metric label="退休时投资资产" value={money(result.summary.retirementAssets)} tone="good"/><Metric label="购房后金融资产" value={money(result.summary.afterPurchaseAssets)} /><Metric label="首年需提取" value={money(result.summary.firstYearWithdrawal)} /><Metric label="资金首次不足" value={result.summary.firstShortfallMonth ?? "规划期内无"} tone={result.summary.firstShortfallMonth ? "warn" : "good"}/></div>
        <Panel title="资产与房贷路径" action={<span className="soft-pill">实际月度数据 · 图表按年抽样</span>}>
          <div className="chart x-tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={yearly}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="age" tickLine={false} axisLine={false} label={{ value: "年龄", position: "insideBottomRight", offset: -5 }}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={(v) => `${v} 万元`}/><Legend/><Line dataKey="投资资产" stroke="#3f7d68" strokeWidth={3} dot={false}/><Line dataKey="现金" stroke="#e8b86d" strokeWidth={2} dot={false}/><Line dataKey="房贷余额" stroke="#e57f67" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="计算口径"><div className="formula"><code>月回报 = (1 + 年化回报)<sup>1/12</sup> − 1</code><p>期初资产先计算回报，再计入收入、住房事件和支出。现金保留 {household.settings.cashBufferMonths} 个月支出，超额自动投资；不足时先用现金、再用投资资产。</p></div></Panel>
      </div>
    </div>
  </>;
}