"use client";

import { AreaChart, Area, CartesianGrid, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Activity, ChevronRight, CircleAlert } from "lucide-react";
import type { AppData, SimulationResult } from "@/types/finance";
import { Metric, Panel, colors, money, percent, sameRiskSettings, type View } from "../ui";
export function Dashboard({ data, result, setView }: { data: AppData; result: SimulationResult; setView: (view: View) => void }) {
  const household = data.household;
  const income = household.members.reduce((sum, item) => sum + item.monthlyIncome, 0);
  const expense = household.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
  const property = household.accounts.filter((a) => a.category === "property").reduce((sum, a) => sum + a.balance, 0);
  const total = household.accounts.reduce((sum, a) => sum + a.balance, 0);
  const chart = result.ledger.filter((_, index) => index % 12 === 0).map((item) => ({
    year: item.month.slice(0, 4), 投资资产: Math.round(item.investments / 10000), 现金: Math.round(item.cash / 10000), 公积金: Math.round(item.provident / 10000), 净资产: Math.round(item.netWorth / 10000)
  }));
  const allocation = [
    { name: "股票投资", value: household.accounts.filter((a) => a.category === "stock").reduce((s, a) => s + a.balance, 0) },
    { name: "现金", value: household.accounts.filter((a) => a.category === "cash").reduce((s, a) => s + a.balance, 0) },
    { name: "公积金", value: household.accounts.filter((a) => a.category === "provident").reduce((s, a) => s + a.balance, 0) },
    { name: "房产", value: property }
  ];
  const latestRisk = data.monteCarloRuns?.find((run) => run.input.settings.iterations === 10000);
  const riskStale = latestRisk && (latestRisk.householdUpdatedAt !== household.updatedAt || !sameRiskSettings(latestRisk.input.settings, data.riskSettings));
  return <>
    <section className="hero">
      <div><span className="eyebrow">家庭半退休路线图</span><h1>离理想生活，<br /><i>还有一段可计算的距离。</i></h1><p>把资产、住房与工作选择放在同一条时间线上，看清每一次决定会把未来带向哪里。</p></div>
      <div className="hero-orbit"><span>预计双人半退休</span><strong>{result.summary.retirementMonth.slice(0, 4)}</strong><small>目标年龄约 40 岁</small><button onClick={() => setView("simulator")}>调整计划 <ChevronRight size={16} /></button></div>
    </section>
    <div className="metric-grid">
      <Metric label="当前可投资资产" value={money(result.summary.investableNow)} note="不含公积金、保险与房产" tone="good" />
      <Metric label="本月家庭结余" value={money(income - expense)} note={`${money(income)} 收入 · ${money(expense)} 支出`} />
      <Metric label="静态 FIRE 目标" value={money(result.summary.fireTarget)} note={`按 ${percent(household.settings.withdrawalRate)} 提取率`} />
      <Metric label="规划终点资产" value={money(result.summary.endingAssets)} note={result.summary.firstShortfallMonth ? `${result.summary.firstShortfallMonth} 首次不足` : "规划期内未耗尽"} tone={result.summary.firstShortfallMonth ? "warn" : "good"} />
    </div>
    <div className="dashboard-grid">
      <Panel title="未来资产路径" eyebrow="2026—2092" className="chart-panel" action={<span className="soft-pill">单位：万元</span>}>
        <div className="chart tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="asset" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3f7d68" stopOpacity={0.32}/><stop offset="100%" stopColor="#3f7d68" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="year" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={(v) => `${v} 万元`}/><Area dataKey="净资产" stroke="#3f7d68" strokeWidth={3} fill="url(#asset)"/><Line dataKey="投资资产" stroke="#e8b86d" dot={false}/></AreaChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="今天的资产组成" eyebrow="资产全景">
        <div className="donut"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={allocation} innerRadius={65} outerRadius={90} paddingAngle={3} dataKey="value">{allocation.map((_, index) => <Cell key={index} fill={colors[index]} />)}</Pie><Tooltip formatter={(v) => money(Number(v))}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(total, true)}</strong><span>家庭总资产</span></div></div>
        <div className="legend-list">{allocation.map((item, i) => <div key={item.name}><span><i style={{ background: colors[i] }} />{item.name}</span><strong>{money(item.value, true)}</strong></div>)}</div>
      </Panel>
    </div>
    <Panel title="长期风险概览" eyebrow="V2.1 风险模型" action={<button className="secondary" onClick={() => setView("risk")}>{latestRisk ? "查看详情" : "开始模拟"}<ChevronRight size={15}/></button>}>
      {latestRisk ? <div className="metric-grid compact"><Metric label="模拟资金充足比例" value={percent(latestRisk.result.fundingRatio)} note={riskStale ? "基础数据已变化，请重新运行" : `${latestRisk.input.settings.iterations.toLocaleString()} 次 · 非保证概率`} tone={riskStale ? "warn" : latestRisk.result.fundingRatio >= 0.8 ? "good" : "warn"}/><Metric label="P10 终点资产" value={money(latestRisk.result.p10EndingAssets)} note="较不利的 10% 分位"/><Metric label="高发不足年龄" value={latestRisk.result.mostCommonShortfallAge ? `${latestRisk.result.mostCommonShortfallAge} 岁` : "未集中出现"}/><Metric label="退休期中位最大回撤" value={percent(latestRisk.result.maxDrawdownMedian)} note={`种子 ${latestRisk.input.settings.seed}`}/></div> : <div className="empty compact-empty"><Activity/><strong>还没有长期风险结果</strong><p>确认波动率假设后运行模拟，这里不会用猜测数字填充。</p></div>}
    </Panel>
    <Panel title="值得先处理的事情" eyebrow="规则风险提示">
      <div className="risk-grid">{result.risks.map((risk) => <article className={`risk ${risk.level}`} key={risk.id}>{risk.level === "info" ? <CircleAlert /> : <CircleAlert />}<div><strong>{risk.title}</strong><p>{risk.detail}</p></div></article>)}</div>
    </Panel>
  </>;
}
