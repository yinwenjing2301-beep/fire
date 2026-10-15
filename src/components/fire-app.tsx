"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell
} from "recharts";
import {
  Activity, BadgeDollarSign, Bot, Building2, ChartNoAxesCombined, ChevronRight, CircleAlert,
  CircleCheck, Cog, Download, Eye, EyeOff, Gauge, GraduationCap, HeartPulse, Home, Landmark, ListChecks, Menu, PiggyBank, Play, Plus,
  RefreshCw, Save, Scale, Settings, ShieldAlert, Sparkles, Trash2, Upload, Users, WalletCards, X, Zap
} from "lucide-react";
import { addMonths, runSimulation } from "@/engine/simulate";
import { buildStressPreset, RISK_ENGINE_VERSION } from "@/engine/risk";
import { baseExpenseAtMonth, lifecycleYearSummary } from "@/engine/lifecycle";
import { defaultAppData } from "@/lib/defaults";
import { downloadBackup, loadData, normalizeData, readBackup, saveData } from "@/lib/storage";
import type { AppData, HouseholdSnapshot, LifecycleExpenseRule, MonteCarloAggregate, MonteCarloSnapshot, RetirementTask, ScenarioSnapshot, SimulationResult, SocialSecurityPlan, StressEvent, StressTestSnapshot, WithdrawalComparisonSnapshot, WithdrawalStrategySettings } from "@/types/finance";

type View = "dashboard" | "family" | "simulator" | "risk-center" | "risk" | "stress" | "withdrawal" | "lifecycle" | "protection" | "checklist" | "housing" | "investments" | "scenarios" | "ai" | "settings";
type AIConnection = { provider: "openai-compatible"; baseUrl: string; model: string; apiKey: string };

const nav: { id: View; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "总览", icon: Home },
  { id: "family", label: "家庭财务", icon: Users },
  { id: "simulator", label: "FIRE 模拟器", icon: Gauge },
  { id: "risk-center", label: "退休风险中心", icon: BadgeDollarSign },
  { id: "risk", label: "长期风险模拟", icon: Activity },
  { id: "stress", label: "压力测试", icon: ShieldAlert },
  { id: "withdrawal", label: "退休提取策略", icon: WalletCards },
  { id: "lifecycle", label: "生命周期规划", icon: GraduationCap },
  { id: "protection", label: "社保与养老金", icon: HeartPulse },
  { id: "checklist", label: "退休准备清单", icon: ListChecks },
  { id: "housing", label: "住房规划", icon: Building2 },
  { id: "investments", label: "投资配置", icon: ChartNoAxesCombined },
  { id: "scenarios", label: "情景对比", icon: Scale },
  { id: "ai", label: "AI 财务顾问", icon: Bot },
  { id: "settings", label: "设置中心", icon: Settings }
];

const colors = ["#3f7d68", "#8ebaa8", "#e8b86d", "#e57f67", "#7c8ea3", "#c8bca7"];
const money = (value: number | null, compact = false) => value == null
  ? "待补充"
  : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const clone = <T,>(value: T): T => structuredClone(value);
const sameRiskSettings = (left: AppData["riskSettings"] | undefined, right: AppData["riskSettings"]) => Boolean(left)
  && left!.annualVolatility === right.annualVolatility
  && left!.iterations === right.iterations
  && left!.seed === right.seed
  && left!.endAge === right.endAge;

type WorkerRequest = Record<string, unknown> & { id: string };
function startRiskWorker(request: WorkerRequest, handlers: { progress: (value: number) => void; result: (value: unknown, engineVersion: string, runtimeMs: number) => void; error: (message: string) => void }) {
  const worker = new Worker(new URL("../workers/risk.worker.ts", import.meta.url));
  worker.onmessage = (message: MessageEvent<{ id: string; type: string; progress?: number; result?: unknown; error?: string; engineVersion?: string; runtimeMs?: number }>) => {
    if (message.data.id !== request.id) return;
    if (message.data.type === "progress") handlers.progress(message.data.progress ?? 0);
    if (message.data.type === "result") { handlers.result(message.data.result, message.data.engineVersion ?? RISK_ENGINE_VERSION, message.data.runtimeMs ?? 0); worker.terminate(); }
    if (message.data.type === "error") { handlers.error(message.data.error ?? "风险模拟失败"); worker.terminate(); }
  };
  worker.onerror = () => { handlers.error("风险计算线程启动失败"); worker.terminate(); };
  worker.postMessage(request);
  return worker;
}

function Field({ label, value, onChange, suffix, step = 1, min, max }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <em>{suffix}</em>}</span>
    </label>
  );
}

function NullableField({ label, value, onChange, suffix, step = 1, min = 0, placeholder = "待补充" }: { label: string; value: number | null; onChange: (value: number | null) => void; suffix?: string; step?: number; min?: number; placeholder?: string }) {
  return <label className="field"><span>{label}</span><span className="input-wrap"><input type="number" value={value ?? ""} min={min} step={step} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}/>{suffix && <em>{suffix}</em>}</span></label>;
}

function QuickOptions({ values, value, onChange, suffix = "" }: { values: number[]; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <div className="quick-options">{values.map((option) => <button type="button" className={value === option ? "selected" : ""} key={option} onClick={() => onChange(option)}>{option}{suffix}</button>)}</div>;
}

function Metric({ label, value, note, tone = "normal" }: { label: string; value: string; note?: string; tone?: "normal" | "good" | "warn" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

function Dashboard({ data, result, setView }: { data: AppData; result: SimulationResult; setView: (view: View) => void }) {
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

function RetirementRiskCenter({ data, result, setView }: { data: AppData; result: SimulationResult; setView: (view: View) => void }) {
  const household = data.household;
  const risk = data.monteCarloRuns?.find((run) => run.input.settings.iterations === 10000);
  const stress = data.stressTestRuns?.[0];
  const cash = household.accounts.filter((account) => account.category === "cash" && account.retirementUsable).reduce((sum, account) => sum + account.balance, 0);
  const currentExpense = household.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
  const essential = Math.max(1, household.withdrawalStrategy.necessaryMonthlyExpense);
  const purchaseEntry = household.housing.enabled ? result.ledger.find((entry) => entry.month === household.housing.purchaseMonth) : null;
  const investable = household.accounts.filter((account) => ["cash", "stock", "bond"].includes(account.category) && account.retirementUsable).reduce((sum, account) => sum + account.balance, 0);
  const stocks = household.accounts.filter((account) => account.category === "stock" && account.retirementUsable).reduce((sum, account) => sum + account.balance, 0);
  const lightIncome = household.settings.maleLightIncome + household.settings.femaleLightIncome;
  const responsibilityMonthly = (household.lifecycle ?? []).filter((rule) => rule.mode === "additional").reduce((sum, rule) => sum + (rule.monthlyAmount ?? 0) + (rule.annualAmount ?? 0) / 12, 0);
  const unknownLifecycle = (household.lifecycle ?? []).filter((rule) => rule.mode === "additional" && rule.monthlyAmount == null && rule.annualAmount == null && rule.oneTimeAmount == null).length;
  const protectionMissing = (household.socialSecurity ?? []).reduce((sum, plan) => sum + Number(plan.medicalCoverage === "unknown") + Number(plan.paidYears == null) + Number(!plan.pensionConfirmed), 0);
  const riskStale = risk && risk.householdUpdatedAt !== household.updatedAt;
  const cards = [
    { title: "长期资金充足度", value: risk ? percent(risk.result.fundingRatio) : "尚未运行", note: riskStale ? "结果已过期" : risk ? `P10 终点 ${money(risk.result.p10EndingAssets, true)}` : "需要 10,000 次正式模拟", tone: !risk || riskStale ? "warning" : risk.result.fundingRatio >= .8 ? "info" : "critical", action: "risk" as View },
    { title: "流动性安全", value: `${(cash / Math.max(1, currentExpense)).toFixed(1)} 个月`, note: `购房后现金 ${purchaseEntry ? money(purchaseEntry.cash, true) : "不适用"} · 压力后 P10 ${stress ? money(stress.impacted.minimumCashP10, true) : "尚未运行"}`, tone: cash / currentExpense >= 12 ? "info" : "critical", action: "stress" as View },
    { title: "劳动收入依赖", value: percent(lightIncome / Math.max(1, household.settings.retirementMonthlyExpense)), note: `轻工作收入减半时，每月需多提取 ${money(lightIncome / 2)}`, tone: lightIncome / Math.max(1, household.settings.retirementMonthlyExpense) > .5 ? "warning" : "info", action: "withdrawal" as View },
    { title: "市场风险暴露", value: percent(stocks / Math.max(1, investable)), note: `权益资产下跌 30% 约损失 ${money(stocks * .3)}`, tone: stocks / Math.max(1, investable) > .7 ? "warning" : "info", action: "investments" as View },
    { title: "家庭责任压力", value: responsibilityMonthly ? `${money(responsibilityMonthly)}/月` : "待补充", note: unknownLifecycle ? `${unknownLifecycle} 个阶段尚未填写金额` : "已填写的额外教育与照护月均金额", tone: unknownLifecycle ? "warning" : "info", action: "lifecycle" as View },
    { title: "保障完备性", value: protectionMissing ? `${protectionMissing} 项待确认` : "关键信息已填", note: "医保、缴费年限和养老金分别核对", tone: protectionMissing ? "warning" : "info", action: "protection" as View }
  ];
  return <><PageIntro eyebrow="退休风险中心" title="没有一个总分，能替你决定什么时候退休。" copy="长期资产、短期现金、劳动收入、市场暴露、家庭责任与保障缺口分别判断；缺少信息不会被当作低风险。"/><div className="risk-center-grid">{cards.map((card) => <article className={`risk-dimension ${card.tone}`} key={card.title}><header><span>{card.title}</span><button className="icon-btn" aria-label={`查看${card.title}`} onClick={() => setView(card.action)}><ChevronRight size={16}/></button></header><strong>{card.value}</strong><p>{card.note}</p></article>)}</div><div className="split-grid"><Panel title="当前判定依据"><div className="setting-list"><div><span>必要生活费</span><strong>{money(essential)}/月</strong></div><div><span>流动性观察线</span><strong>12 个月当前支出</strong></div><div><span>轻工作高依赖线</span><strong>覆盖退休支出 50%</strong></div><div><span>权益高暴露线</span><strong>可投资资产 70%</strong></div><div><span>长期结果口径</span><strong>10,000 次正式模拟</strong></div></div></Panel><Panel title="影响当前计划的主要因素"><div className="risk-grid"><article className="risk warning"><CircleAlert/><div><strong>住房与退休时间接近</strong><p>购房首付、装修和房贷会与半退休初期现金需求叠加。</p></div></article><article className={`risk ${unknownLifecycle ? "warning" : "info"}`}><CircleAlert/><div><strong>家庭阶段费用</strong><p>{unknownLifecycle ? "教育与照护仍有待补充金额，现有结果可能低估未来支出。" : "已填写的阶段费用已经进入确定性和概率模拟。"}</p></div></article><article className={`risk ${protectionMissing ? "warning" : "info"}`}><CircleAlert/><div><strong>养老金与医保</strong><p>只有明确确认的养老金会进入收入，未知保障信息继续显示为缺口。</p></div></article></div></Panel></div></>;
}

function Family({ household, change }: { household: HouseholdSnapshot; change: (next: HouseholdSnapshot) => void }) {
  const updateMember = (index: number, key: "age" | "monthlyIncome" | "providentContribution", value: number) => { const next = clone(household); next.members[index][key] = value; change(next); };
  const removeMember = (id: string) => change({ ...clone(household), members: household.members.filter((member) => member.id !== id) });
  const updateExpense = (index: number, value: number) => { const next = clone(household); next.expenses[index].monthlyAmount = value; change(next); };
  return <>
    <PageIntro eyebrow="家庭财务" title="先把家的底数，理清楚。" copy="所有模拟都从这份资产账本出发。未知数据保留为待补充，不会被悄悄当成零。" />
    <Panel title="家庭成员与收入" action={<button className="secondary"><Plus size={16}/> 添加成员</button>}>
      <div className="member-grid">{household.members.map((member, index) => <article className="member-card" key={member.id}><div className="avatar">{member.name[0]}</div>{!["male", "female", "child"].includes(member.id) && <button className="member-remove" aria-label={`移除${member.name}`} onClick={() => removeMember(member.id)}><Trash2 size={15}/></button>}<div className="member-title"><strong>{member.name}</strong><span>{member.role} · {member.occupation}</span></div><Field label="年龄" value={member.age ?? 0} suffix={member.age == null ? "待补充" : "岁"} onChange={(v) => updateMember(index, "age", v)} /><Field label="月收入" value={member.monthlyIncome} suffix="元" onChange={(v) => updateMember(index, "monthlyIncome", v)} /><Field label="公积金月缴" value={member.providentContribution} suffix="元" onChange={(v) => updateMember(index, "providentContribution", v)} /></article>)}</div>
    </Panel>
    <Panel title="资产账本" eyebrow={`共 ${household.accounts.length} 个账户`}>
      <div className="table-wrap"><table><thead><tr><th>账户</th><th>类别</th><th>余额</th><th>流动性</th><th>退休本金</th></tr></thead><tbody>{household.accounts.map((account) => <tr key={account.id}><td><strong>{account.name}</strong>{account.note && <small>{account.note}</small>}</td><td><span className="tag">{categoryName(account.category)}</span></td><td>{account.note?.includes("待补充") ? "待补充" : money(account.balance)}</td><td>{account.liquid ? "高" : "受限"}</td><td>{account.retirementUsable ? <CircleCheck className="ok" size={18}/> : "—"}</td></tr>)}</tbody></table></div>
    </Panel>
    <Panel title="当前每月支出" eyebrow="支持按生命周期继续扩展">
      <div className="expense-grid">{household.expenses.map((item, index) => <Field key={item.id} label={item.name} value={item.monthlyAmount} suffix="元/月" onChange={(v) => updateExpense(index, v)} />)}</div>
    </Panel>
  </>;
}

function Simulator({ household, result, change, saveScenario }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void; saveScenario: () => void }) {
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
        <button className="primary full" onClick={saveScenario}><Save size={17}/> 保存为正式方案</button>
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

function Housing({ household, result, change }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void }) {
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

function Investments({ household, result, change }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void }) {
  const stocks = household.accounts.filter((a) => a.category === "stock").reduce((s, a) => s + a.balance, 0);
  const cash = household.accounts.filter((a) => a.category === "cash").reduce((s, a) => s + a.balance, 0);
  const total = stocks + cash;
  const stressedLoss = stocks * 0.3;
  return <><PageIntro eyebrow="投资配置" title="回报是变量，结构才是选择。" copy="这里不预测产品收益，只把组合假设、风险暴露与退休计划连接起来。"/><div className="metric-grid"><Metric label="股票类占比" value={percent(stocks / total)} note={money(stocks)}/><Metric label="现金类占比" value={percent(cash / total)} note={money(cash)}/><Metric label="组合回报假设" value={percent(household.settings.annualReturn)} note="非保证收益"/><Metric label="股票下跌 30% 损失" value={money(stressedLoss)} tone="warn"/></div><div className="split-grid"><Panel title="当前可投资组合"><div className="allocation-bars"><div><span>股票类</span><i><b style={{ width: `${stocks / total * 100}%` }}/></i><strong>{percent(stocks / total)}</strong></div><div><span>现金类</span><i><b style={{ width: `${cash / total * 100}%`, background: "#e8b86d" }}/></i><strong>{percent(cash / total)}</strong></div></div><Field label="用于模拟的年化回报" value={household.settings.annualReturn * 100} suffix="%" step={0.1} onChange={(v) => { const next = clone(household); next.settings.annualReturn = v / 100; change(next); }}/></Panel><Panel title="回撤压力测试"><div className="stress"><CircleAlert/><strong>退休首年下跌 30%</strong><p>当前股票资产将产生约 {money(stressedLoss)} 的账面回撤。建议在情景中保存此压力版本，与基准方案并排查看。</p><span>确定性引擎不会把这一结果包装成“成功概率”。</span></div></Panel></div></>;
}

function Scenarios({ data, saveScenario, savePreset, removeScenario }: { data: AppData; saveScenario: () => void; savePreset: (preset: string) => void; removeScenario: (id: string) => void }) {
  const cards = data.scenarios.slice(0, 4);
  const riskFor = (scenario: ScenarioSnapshot) => (data.monteCarloRuns ?? []).find((run) => run.householdUpdatedAt === scenario.input.updatedAt && run.input.settings.iterations === 10000);
  const presets = [["normal", "正常工作到 40 岁"], ["job-loss", "男方提前失业一年"], ["both-light", "40 岁双人轻工作"], ["male-light", "仅男方轻工作"], ["female-light", "仅女方轻工作"], ["no-work", "双方零工作收入"], ["crash", "退休首年下跌 30%"]];
  return <><PageIntro eyebrow="情景对比" title="不是寻找唯一答案，而是看懂取舍。" copy="最多并排比较四个正式方案。每份方案都保存完整输入和引擎结果，可随时复现。"/><Panel title="快速压力情景" eyebrow="点击即生成完整快照"><div className="preset-list">{presets.map(([id, label]) => <button key={id} onClick={() => savePreset(id)}>{label}<Plus size={14}/></button>)}</div></Panel><Panel title="已保存方案" action={<button className="primary" onClick={saveScenario}><Plus size={16}/> 保存当前方案</button>}>{cards.length === 0 ? <div className="empty"><Scale/><strong>还没有正式方案</strong><p>从模拟器保存当前配置后，就能在这里比较。</p></div> : <div className="scenario-grid">{cards.map((scenario, index) => { const risk = riskFor(scenario); const stability = !risk ? "尚未运行" : risk.result.fundingRatio >= 0.8 && risk.result.maxDrawdownMedian <= 0.3 ? "较稳健" : risk.result.fundingRatio >= 0.6 ? "需关注" : "明显承压"; return <article className="scenario-card" key={scenario.id}><div><span className="scenario-index">0{index + 1}</span><button className="icon-btn" aria-label="删除方案" onClick={() => removeScenario(scenario.id)}><X size={16}/></button></div><h3>{scenario.name}</h3><small>{new Date(scenario.createdAt).toLocaleString("zh-CN")}</small><dl><div><dt>退出全职</dt><dd>{scenario.result.summary.retirementMonth}</dd></div><div><dt>退休时资产</dt><dd>{money(scenario.result.summary.retirementAssets, true)}</dd></div><div><dt>首次不足</dt><dd>{scenario.result.summary.firstShortfallMonth ?? "无"}</dd></div><div><dt>资金充足比例</dt><dd>{risk ? percent(risk.result.fundingRatio) : "尚未运行"}</dd></div><div><dt>风险 P10 终点</dt><dd>{risk ? money(risk.result.p10EndingAssets, true) : "—"}</dd></div><div><dt>中位最大回撤</dt><dd>{risk ? percent(risk.result.maxDrawdownMedian) : "—"}</dd></div><div><dt>生活稳定性</dt><dd>{stability}</dd></div></dl></article>; })}</div>}</Panel></>;
}

function RiskSimulation({ data, update }: { data: AppData; update: (next: AppData) => void }) {
  const worker = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  const settings = data.riskSettings ?? defaultAppData.riskSettings;
  const latest = data.monteCarloRuns?.[0];
  const previousFormal = data.monteCarloRuns?.find((run) => run.id !== latest?.id && run.input.settings.iterations === 10000);
  const missingInputs = [data.household.accounts.some((account) => account.category === "insurance" && account.note?.includes("待补充")) ? "保险现金价值" : null, data.household.members.some((member) => member.age == null) ? "家庭成员年龄" : null].filter(Boolean).join("、");
  const stale = latest && (latest.householdUpdatedAt !== data.household.updatedAt || !sameRiskSettings(latest.input.settings, settings));
  const setSettings = (values: Partial<typeof settings>) => update({ ...data, riskSettings: { ...settings, ...values } });
  const run = () => {
    if (!settings.confirmed || running) return;
    setRunning(true); setProgress(0); setError("");
    const requestId = crypto.randomUUID();
    const input = { household: clone(data.household), settings: { ...clone(settings), seed: Math.round(settings.seed) >>> 0 }, events: [] };
    worker.current = startRiskWorker({ id: requestId, type: "monte-carlo", input }, {
      progress: setProgress,
      result: (value, engineVersion, runtimeMs) => {
        const snapshot: MonteCarloSnapshot = { id: crypto.randomUUID(), name: `${settings.iterations.toLocaleString()} 次长期风险模拟`, createdAt: new Date().toISOString(), householdUpdatedAt: data.household.updatedAt, engineVersion, runtimeMs, input, result: value as MonteCarloAggregate };
        update({ ...data, monteCarloRuns: [snapshot, ...(data.monteCarloRuns ?? [])].slice(0, 20) }); setRunning(false); setProgress(1);
      },
      error: (message) => { setError(message); setRunning(false); }
    });
  };
  const cancel = () => { worker.current?.terminate(); worker.current = null; setRunning(false); setProgress(0); };
  const chart = latest?.result.annualPaths.map((item) => ({ age: Math.round(item.age), P10: Math.round(item.p10 / 10000), P25: Math.round(item.p25 / 10000), 中位数: Math.round(item.p50 / 10000), P75: Math.round(item.p75 / 10000), P90: Math.round(item.p90 / 10000) })) ?? [];
  const decadeChart = latest?.result.retirementDecadePaths.filter((_, index) => index % 3 === 0).map((item) => ({ month: item.month, P10: Math.round(item.p10 / 10000), 中位数: Math.round(item.p50 / 10000), P90: Math.round(item.p90 / 10000) })) ?? [];
  return <><PageIntro eyebrow="长期风险模拟" title="平均收益之外，还有一万种可能。" copy="用可复现的随机路径观察顺序风险。资金充足比例只描述当前模型假设，不是退休保证。"/>
    <div className="risk-layout">
      <Panel title="风险模型假设" eyebrow="运行前必须确认" className="sticky-panel"><div className="form-stack">
        <div className="setting-list risk-input-summary">
          <div><span>当前正式家庭</span><strong>{data.household.householdName}</strong></div>
          <div><span>共同退休年龄</span><strong>{Math.max(data.household.settings.maleRetirementAge, data.household.settings.femaleRetirementAge)} 岁</strong></div>
          <div><span>预期年化收益</span><strong>{percent(data.household.settings.annualReturn)}</strong></div>
          <div><span>通胀假设</span><strong>{percent(data.household.settings.inflationRate)}</strong></div>
          <div><span>轻工作月收入</span><strong>{money(data.household.settings.maleLightIncome + data.household.settings.femaleLightIncome)}</strong></div>
          <div><span>退休月支出</span><strong>{money(data.household.settings.retirementMonthlyExpense)}</strong></div>
        </div>
        <label className="field"><span>波动率预设</span><select value={settings.annualVolatility} onChange={(event) => setSettings({ annualVolatility: Number(event.target.value), confirmed: false })}><option value={0.05}>低波动 · 年化 5%</option><option value={0.08}>稳健 · 年化 8%</option><option value={0.10}>偏稳健 · 年化 10%</option><option value={0.12}>稳健均衡 · 年化 12%</option><option value={0.15}>均衡 · 年化 15%</option><option value={0.18}>成长 · 年化 18%</option><option value={0.20}>偏进取 · 年化 20%</option><option value={0.22}>进取 · 年化 22%</option><option value={0.25}>高成长 · 年化 25%</option><option value={0.30}>高波动 · 年化 30%</option></select></label>
        <label className="field"><span>模拟路径数量</span><select value={settings.iterations} onChange={(event) => setSettings({ iterations: Number(event.target.value) })}><option value={1000}>1,000 次快速预览</option><option value={10000}>10,000 次正式模拟</option></select></label>
        <Field label="随机种子" value={settings.seed} step={1} min={0} max={4294967295} onChange={(value) => setSettings({ seed: Math.round(value) >>> 0 })}/>
        <Field label="规划终点年龄" value={settings.endAge} suffix="岁" min={80} max={110} onChange={(value) => setSettings({ endAge: Math.min(110, Math.max(80, Math.round(value))) })}/>
        <button className="secondary full" onClick={() => setSettings({ seed: crypto.getRandomValues(new Uint32Array(1))[0] })}><RefreshCw size={16}/> 重新生成种子</button>
        <div className={`assumption-confirm ${settings.confirmed ? "confirmed" : ""}`}><CircleAlert/><div><strong>{settings.confirmed ? "风险假设已确认" : "这是一项模型假设"}</strong><p>年化收益读取当前方案，市场波动按对数正态分布生成。现实市场可能出现模型未覆盖的极端情况。</p></div></div>
        {!settings.confirmed && <button className="secondary full" onClick={() => setSettings({ confirmed: true })}><CircleCheck size={16}/> 确认使用该波动率</button>}
      </div>
      {running ? <><div className="progress"><i style={{ width: `${Math.round(progress * 100)}%` }}/></div><p className="progress-label">正在计算 {Math.round(progress * 100)}%</p><button className="secondary full" onClick={cancel}>取消模拟</button></> : <button className="primary full" disabled={!settings.confirmed} onClick={run}><Play size={17}/> 开始风险模拟</button>}{error && <p className="connection error">{error}</p>}</Panel>
      <div className="risk-results">{latest ? <>
        {stale && <div className="stale-banner"><CircleAlert/>基础财务数据已变化，这份历史结果需要重新计算。</div>}
        <div className="metric-grid compact"><Metric label="模拟资金充足比例" value={percent(latest.result.fundingRatio)} note={`${latest.input.settings.iterations.toLocaleString()} 条路径 · 非保证概率`} tone={latest.result.fundingRatio >= .8 ? "good" : "warn"}/><Metric label="中位终点资产" value={money(latest.result.medianEndingAssets)}/><Metric label="P10 终点资产" value={money(latest.result.p10EndingAssets)} tone="warn"/><Metric label="高发不足年龄" value={latest.result.mostCommonShortfallAge ? `${latest.result.mostCommonShortfallAge} 岁` : "未集中出现"}/></div>
        <Panel title="长期资产路径区间" eyebrow="单位：万元" action={<span className="soft-pill">引擎 {latest.engineVersion}</span>}><div className="chart x-tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="age" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={(value) => `${value} 万元`}/><Legend/><Line dataKey="P10" stroke="#e57f67" dot={false}/><Line dataKey="P25" stroke="#d8a35e" dot={false}/><Line dataKey="中位数" stroke="#3f7d68" strokeWidth={3} dot={false}/><Line dataKey="P75" stroke="#8ebaa8" dot={false}/><Line dataKey="P90" stroke="#7c8ea3" dot={false}/></LineChart></ResponsiveContainer></div></Panel>
        <Panel title="退休后前十年顺序风险" eyebrow="按季度抽样 · 单位：万元"><div className="chart x-tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={decadeChart}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="month" tickLine={false} axisLine={false} minTickGap={30}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={(value) => `${value} 万元`}/><Legend/><Line dataKey="P10" stroke="#e57f67" dot={false}/><Line dataKey="中位数" stroke="#3f7d68" strokeWidth={3} dot={false}/><Line dataKey="P90" stroke="#7c8ea3" dot={false}/></LineChart></ResponsiveContainer></div></Panel>
        {previousFormal && <Panel title="与最近一次正式结果比较" eyebrow={new Date(previousFormal.createdAt).toLocaleString("zh-CN")}><div className="comparison-row"><div><span>资金充足比例</span><strong>{percent(latest.result.fundingRatio)}</strong><small>{((latest.result.fundingRatio-previousFormal.result.fundingRatio)*100).toFixed(1)} 个百分点</small></div><div><span>P10 终点资产</span><strong>{money(latest.result.p10EndingAssets)}</strong><small>{money(latest.result.p10EndingAssets-previousFormal.result.p10EndingAssets)}</small></div><div><span>中位终点资产</span><strong>{money(latest.result.medianEndingAssets)}</strong><small>{money(latest.result.medianEndingAssets-previousFormal.result.medianEndingAssets)}</small></div></div></Panel>}
        <div className="split-grid"><Panel title="资金不足年龄分布"><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={latest.result.shortfallByAge}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="age"/><YAxis/><Tooltip formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}/><Bar dataKey="percentage" fill="#e57f67" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></Panel><Panel title="本次计算说明"><div className="setting-list"><div><span>结果级别</span><strong>{latest.input.settings.iterations === 10000 ? "正式模拟" : "快速预览"}</strong></div><div><span>基准月</span><strong>{latest.input.household.baseMonth}</strong></div><div><span>家庭数据版本</span><strong>{new Date(latest.householdUpdatedAt).toLocaleString("zh-CN")}</strong></div><div><span>随机种子</span><strong>{latest.input.settings.seed}</strong></div><div><span>年化波动率</span><strong>{percent(latest.input.settings.annualVolatility)}</strong></div><div><span>收益模型</span><strong>月度对数正态</strong></div><div><span>金额口径</span><strong>人民币分 · 月末取整</strong></div><div><span>缺失数据</span><strong>{missingInputs || "无关键缺失"}</strong></div><div><span>退休期中位最大回撤</span><strong>{percent(latest.result.maxDrawdownMedian)}</strong></div><div><span>运行时间</span><strong>{latest.runtimeMs ?? 0} ms</strong></div><div><span>生成时间</span><strong>{new Date(latest.createdAt).toLocaleString("zh-CN")}</strong></div></div></Panel></div>
      </> : <Panel title="等待第一次模拟"><div className="empty"><Activity/><strong>先确认波动率假设</strong><p>完成后会显示资产路径区间、资金不足年龄和退休初期回撤。</p></div></Panel>}</div>
    </div></>;
}

const lifecycleCategoryNames: Record<LifecycleExpenseRule["category"], string> = { education: "子女教育", eldercare: "老人照护", medical: "医疗护理", living: "生活阶段", insurance: "保险保障", other: "其他" };

function Lifecycle({ household, change }: { household: HouseholdSnapshot; change: (next: HouseholdSnapshot) => void }) {
  const [selectedYear, setSelectedYear] = useState(Number(household.baseMonth.slice(0, 4)));
  const rules = household.lifecycle ?? [];
  const updateRule = (id: string, values: Partial<LifecycleExpenseRule>) => { const next = clone(household); next.lifecycle = next.lifecycle.map((rule) => rule.id === id ? { ...rule, ...values } : rule); change(next); };
  const addRule = () => { const next = clone(household); next.lifecycle = [...next.lifecycle, { id: crypto.randomUUID(), name: "新的阶段性支出", category: "other", startMonth: household.baseMonth, monthlyAmount: null, annualAmount: null, oneTimeAmount: null, inflationRate: 0.02, mode: "additional", essential: false }]; change(next); };
  const removeRule = (rule: LifecycleExpenseRule) => { if (!window.confirm(`删除“${rule.name}”？`)) return; const next = clone(household); next.lifecycle = next.lifecycle.filter((item) => item.id !== rule.id); change(next); };
  const baseYear = Number(household.baseMonth.slice(0, 4));
  const male = household.members.find((member) => member.id === "male");
  const female = household.members.find((member) => member.id === "female");
  const retirementOffset = Math.max((household.settings.maleRetirementAge - (male?.age ?? household.settings.maleRetirementAge)) * 12, (household.settings.femaleRetirementAge - (female?.age ?? household.settings.femaleRetirementAge)) * 12);
  const chart = Array.from({ length: 51 }, (_, index) => {
    const summary = lifecycleYearSummary(household, index);
    let regularExpense = 0;
    for (let month = index * 12; month < index * 12 + 12; month += 1) regularExpense += month >= retirementOffset ? household.settings.retirementMonthlyExpense * Math.pow(1 + household.settings.inflationRate, month / 12) : baseExpenseAtMonth(household, month);
    return { year: baseYear + index, 基础生活: Math.round(regularExpense / 10000), 阶段支出: Math.round(summary.lifecycleExpense / 10000), 保障缴费: Math.round(summary.protectionExpense / 10000), 养老金收入: Math.round(summary.pensionIncome / 10000) };
  });
  const activeRules = rules.filter((rule) => rule.startMonth <= `${selectedYear}-12` && (!rule.endMonth || rule.endMonth >= `${selectedYear}-01`));
  return <><PageIntro eyebrow="家庭生命周期" title="把未来的大事，放进同一条时间线。" copy="教育、照护和医疗费用只有在你填写后才进入模拟；标记为“已包含”的项目只用于说明，不会重复计费。"/>
    <Panel title="未来 50 年家庭支出" eyebrow="年度金额 · 万元"><div className="chart x-tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} onClick={(state) => { const year = Number(state?.activeLabel); if (year) setSelectedYear(year); }}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="year" minTickGap={24}/><YAxis/><Tooltip formatter={(value) => `${value} 万元`}/><Legend/><Area type="monotone" dataKey="基础生活" stackId="expense" stroke="#8ebaa8" fill="#dcece5"/><Area type="monotone" dataKey="阶段支出" stackId="expense" stroke="#e57f67" fill="#f5d4ca"/><Area type="monotone" dataKey="保障缴费" stackId="expense" stroke="#e8b86d" fill="#f7e6c8"/><Line type="monotone" dataKey="养老金收入" stroke="#3f7d68" strokeWidth={3} dot={false}/></AreaChart></ResponsiveContainer></div><div className="timeline-year"><strong>{selectedYear} 年</strong><span>{activeRules.length ? activeRules.map((rule) => rule.name).join(" · ") : "暂无阶段事件"}</span></div></Panel>
    <Panel title="阶段与费用规则" eyebrow={`${rules.length} 条 · 未填写金额显示待补充`} action={<button className="primary" onClick={addRule}><Plus size={16}/> 添加阶段</button>}><div className="lifecycle-list">{rules.map((rule) => <article className="lifecycle-card" key={rule.id}><header><div><span>{lifecycleCategoryNames[rule.category]}</span><input aria-label="阶段名称" value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })}/></div><button className="icon-btn" aria-label="删除阶段" onClick={() => removeRule(rule)}><Trash2 size={16}/></button></header><div className="expense-grid"><label className="field"><span>类型</span><select value={rule.category} onChange={(event) => updateRule(rule.id, { category: event.target.value as LifecycleExpenseRule["category"] })}>{Object.entries(lifecycleCategoryNames).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>计费方式</span><select value={rule.mode} onChange={(event) => updateRule(rule.id, { mode: event.target.value as LifecycleExpenseRule["mode"] })}><option value="additional">额外增加</option><option value="included">已包含，不重复计费</option></select></label><label className="field"><span>开始月份</span><input type="month" value={rule.startMonth} onChange={(event) => updateRule(rule.id, { startMonth: event.target.value as typeof rule.startMonth })}/></label><label className="field"><span>结束月份</span><input type="month" value={rule.endMonth ?? ""} onChange={(event) => updateRule(rule.id, { endMonth: (event.target.value || undefined) as typeof rule.endMonth })}/></label><NullableField label="每月费用" value={rule.monthlyAmount} suffix="元" onChange={(value) => updateRule(rule.id, { monthlyAmount: value })}/><NullableField label="每年额外费用" value={rule.annualAmount} suffix="元" onChange={(value) => updateRule(rule.id, { annualAmount: value })}/><NullableField label="一次性费用" value={rule.oneTimeAmount} suffix="元" onChange={(value) => updateRule(rule.id, { oneTimeAmount: value })}/><Field label="费用年增长" value={rule.inflationRate * 100} suffix="%" step={0.1} min={0} onChange={(value) => updateRule(rule.id, { inflationRate: value / 100 })}/></div><label className="check-row"><input type="checkbox" checked={rule.essential} onChange={(event) => updateRule(rule.id, { essential: event.target.checked })}/><span>必要支出，不允许动态策略自动削减</span></label>{rule.mode === "included" && <p className="included-note">此项仅显示在时间线上，当前金额已包含在基础生活费中。</p>}</article>)}</div></Panel>
  </>;
}

const coverageNames: Record<SocialSecurityPlan["medicalCoverage"], string> = { employee: "职工医保", resident: "城乡居民医保", flexible: "灵活就业医保", unknown: "待确认" };

function Protection({ household, change }: { household: HouseholdSnapshot; change: (next: HouseholdSnapshot) => void }) {
  const plans = household.socialSecurity ?? [];
  const updatePlan = (memberId: SocialSecurityPlan["memberId"], values: Partial<SocialSecurityPlan>) => { const next = clone(household); next.socialSecurity = next.socialSecurity.map((plan) => plan.memberId === memberId ? { ...plan, ...values } : plan); change(next); };
  return <><PageIntro eyebrow="社保医保与养老金" title="未知就是未知，确认后才进入现金流。" copy="夫妻分别配置缴费和领取假设。未确认的养老金不会被当作确定收入，医保状态不明确时会保留风险提示。"/><div className="protection-grid">{plans.map((plan) => { const member = household.members.find((item) => item.id === plan.memberId); return <Panel title={`${member?.name ?? plan.memberId}保障方案`} eyebrow={plan.pensionConfirmed ? "养老金假设已确认" : "养老金待确认"} key={plan.memberId}><div className="form-stack"><label className="field"><span>当前参保地区</span><input value={plan.currentRegion} onChange={(event) => updatePlan(plan.memberId, { currentRegion: event.target.value })}/></label><label className="field"><span>未来参保地区</span><input value={plan.futureRegion} onChange={(event) => updatePlan(plan.memberId, { futureRegion: event.target.value })}/></label><NullableField label="已缴费年限" value={plan.paidYears} suffix="年" step={0.5} onChange={(value) => updatePlan(plan.memberId, { paidYears: value })}/><label className="field"><span>医保方式</span><select value={plan.medicalCoverage} onChange={(event) => updatePlan(plan.memberId, { medicalCoverage: event.target.value as SocialSecurityPlan["medicalCoverage"] })}>{Object.entries(coverageNames).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><div className="toggle-row"><span>退出全职后继续缴费</span><button aria-label="切换继续缴费" className={`toggle ${plan.continueContributions ? "on" : ""}`} onClick={() => updatePlan(plan.memberId, { continueContributions: !plan.continueContributions })}><i/></button></div>{plan.continueContributions && <NullableField label="预计每月社保医保缴费" value={plan.monthlyContribution} suffix="元" onChange={(value) => updatePlan(plan.memberId, { monthlyContribution: value })}/>}<NullableField label="商业保障年度保费" value={plan.annualCommercialPremium} suffix="元/年" onChange={(value) => updatePlan(plan.memberId, { annualCommercialPremium: value })}/><NullableField label="养老金开始年龄" value={plan.pensionStartAge} suffix="岁" onChange={(value) => updatePlan(plan.memberId, { pensionStartAge: value })}/><NullableField label="预计每月养老金" value={plan.estimatedMonthlyPension} suffix="元" onChange={(value) => updatePlan(plan.memberId, { estimatedMonthlyPension: value })}/><div className={`assumption-confirm ${plan.pensionConfirmed ? "confirmed" : ""}`}><CircleAlert/><div><strong>{plan.pensionConfirmed ? "已作为模型假设使用" : "尚未进入模拟收入"}</strong><p>请依据个人缴费记录或可核实测算填写；这不是待遇承诺。</p></div></div><button className="secondary full" disabled={plan.estimatedMonthlyPension == null || plan.pensionStartAge == null} onClick={() => updatePlan(plan.memberId, { pensionConfirmed: !plan.pensionConfirmed })}>{plan.pensionConfirmed ? "取消养老金假设" : "确认并纳入现金流"}</button><label className="field"><span>备注</span><textarea value={plan.note} onChange={(event) => updatePlan(plan.memberId, { note: event.target.value })}/></label></div></Panel>; })}</div><Panel title="当前保障缺口"><div className="risk-grid">{plans.map((plan) => <article className={`risk ${plan.medicalCoverage === "unknown" || !plan.pensionConfirmed ? "warning" : "info"}`} key={plan.memberId}><CircleAlert/><div><strong>{household.members.find((item) => item.id === plan.memberId)?.name}</strong><p>{[plan.medicalCoverage === "unknown" ? "医保衔接方式待确认" : null, plan.paidYears == null ? "社保缴费年限待补充" : null, !plan.pensionConfirmed ? "养老金金额尚未纳入模型" : null].filter(Boolean).join("；") || "当前配置已填写，仍需定期核实政策条件。"}</p></div></article>)}</div></Panel></>;
}

const withdrawalLabels: Record<WithdrawalStrategySettings["type"], string> = { "fixed-real": "固定实际金额", "fixed-percent": "固定资产比例", flexible: "弹性支出调整", "cash-buffer": "现金缓冲提取" };

function WithdrawalStrategies({ data, update }: { data: AppData; update: (next: AppData) => void }) {
  const worker = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  const strategy = data.household.withdrawalStrategy;
  const latest = data.withdrawalRuns?.[0];
  const stale = latest && latest.householdUpdatedAt !== data.household.updatedAt;
  const set = (values: Partial<WithdrawalStrategySettings>) => { const household = clone(data.household); household.withdrawalStrategy = { ...strategy, ...values }; household.updatedAt = new Date().toISOString(); update({ ...data, household }); };
  const run = () => {
    if (running || !data.riskSettings.confirmed) return;
    setRunning(true); setProgress(0); setError("");
    const id = crypto.randomUUID();
    worker.current = startRiskWorker({ id, type: "withdrawal-compare", household: clone(data.household), settings: clone(data.riskSettings) }, { progress: setProgress, result: (value, _engineVersion, runtimeMs) => { const snapshot = { ...(value as WithdrawalComparisonSnapshot), runtimeMs }; update({ ...data, withdrawalRuns: [snapshot, ...(data.withdrawalRuns ?? [])].slice(0, 20) }); setRunning(false); setProgress(1); }, error: (message) => { setError(message); setRunning(false); } });
  };
  return <><PageIntro eyebrow="动态退休提取" title="降低风险，也要看生活付出了什么。" copy="四种策略使用同一家庭数据和随机种子复算；生活稳定性越低，代表模型中实际削减的退休支出越多。"/><div className="risk-layout"><Panel title="正式提取策略" eyebrow="保存后影响确定性与风险模拟" className="sticky-panel"><div className="form-stack"><label className="field"><span>策略类型</span><select value={strategy.type} onChange={(event) => set({ type: event.target.value as WithdrawalStrategySettings["type"] })}>{Object.entries(withdrawalLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><Field label="必要生活费" value={strategy.necessaryMonthlyExpense} suffix="元/月" min={0} onChange={(value) => set({ necessaryMonthlyExpense: value })}/><Field label="可调整生活费" value={strategy.discretionaryMonthlyExpense} suffix="元/月" min={0} onChange={(value) => set({ discretionaryMonthlyExpense: value })}/>{strategy.type === "fixed-percent" && <Field label="年度资产提取比例" value={strategy.annualRate * 100} suffix="%" step={0.1} min={0} onChange={(value) => set({ annualRate: value / 100 })}/>} {strategy.type === "flexible" && <><Field label="触发支出调整的回撤" value={strategy.drawdownTrigger * 100} suffix="%" step={1} min={0} max={100} onChange={(value) => set({ drawdownTrigger: value / 100 })}/><Field label="可调整支出削减比例" value={strategy.discretionaryReduction * 100} suffix="%" step={1} min={0} max={100} onChange={(value) => set({ discretionaryReduction: value / 100 })}/></>} {strategy.type === "cash-buffer" && <Field label="现金缓冲" value={strategy.cashBufferMonths} suffix="个月" min={0} onChange={(value) => set({ cashBufferMonths: value })}/>}<div className="assumption-confirm confirmed"><CircleCheck/><div><strong>当前正式策略：{withdrawalLabels[strategy.type]}</strong><p>必要支出不会被弹性策略自动削减；阶段规则中标记为必要的教育、医疗与照护费用也会额外支付。</p></div></div>{!data.riskSettings.confirmed && <p className="connection error">请先到长期风险模拟确认波动率。</p>}{running ? <><div className="progress"><i style={{ width: `${progress * 100}%` }}/></div><p className="progress-label">正在比较 {Math.round(progress * 100)}%</p><button className="secondary full" onClick={() => { worker.current?.terminate(); setRunning(false); }}>取消比较</button></> : <button className="primary full" disabled={!data.riskSettings.confirmed} onClick={run}><Play size={16}/> 比较四种策略</button>}{error && <p className="connection error">{error}</p>}</div></Panel><div>{latest ? <>{stale && <div className="stale-banner"><CircleAlert/>家庭数据或正式策略已变化，这份比较是历史结果。</div>}<div className="strategy-grid">{latest.results.map((item) => <article className={item.type === strategy.type ? "selected" : ""} key={item.type}><header><span>{item.type === strategy.type ? "当前正式策略" : "对照策略"}</span><h3>{item.label}</h3></header><dl><div><dt>资金充足比例</dt><dd>{percent(item.aggregate.fundingRatio)}</dd></div><div><dt>生活稳定性</dt><dd>{percent(item.aggregate.lifestyleStabilityMedian ?? 1)}</dd></div><div><dt>中位最大回撤</dt><dd>{percent(item.aggregate.maxDrawdownMedian)}</dd></div><div><dt>P10 终点资产</dt><dd>{money(item.aggregate.p10EndingAssets, true)}</dd></div><div><dt>高发不足年龄</dt><dd>{item.aggregate.mostCommonShortfallAge ? `${item.aggregate.mostCommonShortfallAge} 岁` : "未集中出现"}</dd></div></dl><button className="secondary full" onClick={() => set({ type: item.type })}>设为正式策略</button></article>)}</div><p className="muted comparison-note">本次使用 1,000 条快速路径、种子 {latest.seed}，用于同条件策略比较，不替代 10,000 次正式风险模拟。</p></> : <Panel title="等待策略比较"><div className="empty"><WalletCards/><strong>先确认参数，再运行比较</strong><p>系统会展示资金风险、生活费稳定程度、最大回撤和晚年资产。</p></div></Panel>}</div></div></>;
}

const taskCategoryNames: Record<RetirementTask["category"], string> = { finance: "财务准备", protection: "保险与养老", housing: "居住准备", work: "工作准备", family: "家庭生活" };
const taskStatusNames: Record<RetirementTask["status"], string> = { todo: "未开始", doing: "进行中", done: "已完成", "not-applicable": "暂不适用" };

function RetirementChecklist({ data, update }: { data: AppData; update: (next: AppData) => void }) {
  const [title, setTitle] = useState("");
  const tasks = data.retirementTasks ?? [];
  const updateTask = (id: string, values: Partial<RetirementTask>) => update({ ...data, retirementTasks: tasks.map((task) => task.id === id ? { ...task, ...values } : task) });
  const addTask = () => { if (!title.trim()) return; update({ ...data, retirementTasks: [...tasks, { id: crypto.randomUUID(), title: title.trim(), category: "finance", status: "todo", note: "", custom: true }] }); setTitle(""); };
  const remaining = tasks.filter((task) => task.status !== "done" && task.status !== "not-applicable");
  const male = data.household.members.find((member) => member.id === "male");
  const female = data.household.members.find((member) => member.id === "female");
  const years = Math.max(data.household.settings.maleRetirementAge - (male?.age ?? data.household.settings.maleRetirementAge), data.household.settings.femaleRetirementAge - (female?.age ?? data.household.settings.femaleRetirementAge));
  return <><PageIntro eyebrow="退休前准备清单" title={`距离计划半退休约 ${Math.max(0, years)} 年，还有 ${remaining.length} 项待推进。`} copy="清单帮助落实行动，但勾选完成不代表财务风险自动消失；关键数字仍以模拟和实际核实结果为准。"/><Panel title="添加自定义任务"><div className="task-composer"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：咨询昆明灵活就业医保" onKeyDown={(event) => { if (event.key === "Enter") addTask(); }}/><button className="primary" onClick={addTask}><Plus size={16}/> 添加</button></div></Panel><div className="checklist-groups">{Object.entries(taskCategoryNames).map(([category,label]) => { const items = tasks.filter((task) => task.category === category); if (!items.length) return null; return <Panel title={label} eyebrow={`${items.filter((task) => task.status === "done").length}/${items.length} 已完成`} key={category}><div className="task-list">{items.map((task) => <article className={`task-item ${task.status}`} key={task.id}><div className="task-main"><select aria-label="任务状态" value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as RetirementTask["status"] })}>{Object.entries(taskStatusNames).map(([value,name]) => <option value={value} key={value}>{name}</option>)}</select><div><strong>{task.title}</strong><label><span>计划完成</span><input type="month" value={task.dueMonth ?? ""} onChange={(event) => updateTask(task.id, { dueMonth: (event.target.value || undefined) as typeof task.dueMonth })}/></label></div>{task.custom && <button className="icon-btn" aria-label="删除任务" onClick={() => update({ ...data, retirementTasks: tasks.filter((item) => item.id !== task.id) })}><Trash2 size={15}/></button>}</div><textarea aria-label="任务备注" value={task.note} placeholder="补充前提、结论或下一步…" onChange={(event) => updateTask(task.id, { note: event.target.value })}/></article>)}</div></Panel>; })}</div></>;
}

const stressKinds = [["male-job-loss","男方提前裁员"],["both-job-loss","夫妻同时失业"],["market-crash","退休初期暴跌"],["light-income-loss","轻工作中断"],["medical-expense","重大医疗开支"],["expense-increase","生活费上涨"],["combined","多重风险叠加"]];

function StressCenter({ data, update }: { data: AppData; update: (next: AppData) => void }) {
  const worker = useRef<Worker | null>(null);
  const [kind, setKind] = useState("male-job-loss");
  const initial = buildStressPreset("male-job-loss", data.household);
  const [name, setName] = useState(initial.name);
  const [events, setEvents] = useState<StressEvent[]>(initial.events);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  const latest = data.stressTestRuns?.[0];
  const stale = latest && (latest.householdUpdatedAt !== data.household.updatedAt || !sameRiskSettings(latest.input?.settings, data.riskSettings ?? defaultAppData.riskSettings));
  const select = (value: string) => { const preset = buildStressPreset(value, data.household); setKind(value); setName(preset.name); setEvents(preset.events); };
  const changeEvent = (id: string, values: Partial<StressEvent>) => setEvents(events.map((item) => item.id === id ? { ...item, ...values } : item));
  const addEvent = (value: string) => { if (!value) return; const next = buildStressPreset(value, data.household).events[0]; setEvents([...events, { ...next, id: `${next.type}-${crypto.randomUUID()}` }]); };
  const run = () => {
    if (!(data.riskSettings ?? defaultAppData.riskSettings).confirmed || running) return;
    setRunning(true); setProgress(0); setError("");
    const id = crypto.randomUUID();
    worker.current = startRiskWorker({ id, type: "stress", name, household: clone(data.household), settings: clone(data.riskSettings ?? defaultAppData.riskSettings), events: clone(events) }, {
      progress: setProgress,
      result: (value, _engineVersion, runtimeMs) => { update({ ...data, stressTestRuns: [{ ...(value as StressTestSnapshot), runtimeMs }, ...(data.stressTestRuns ?? [])].slice(0, 20) }); setRunning(false); setProgress(1); },
      error: (message) => { setError(message); setRunning(false); }
    });
  };
  const cancel = () => { worker.current?.terminate(); setRunning(false); setProgress(0); };
  const currentExpense = data.household.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
  const shortfallChart = latest ? [...new Set([...latest.baseline.shortfallByAge.map((item) => item.age), ...latest.impacted.shortfallByAge.map((item) => item.age)])].sort((a,b) => a-b).map((age) => ({ age, 基准: latest.baseline.shortfallByAge.find((item) => item.age === age)?.percentage ?? 0, 冲击后: latest.impacted.shortfallByAge.find((item) => item.age === age)?.percentage ?? 0 })) : [];
  return <><PageIntro eyebrow="家庭财务压力测试" title="不预测坏事，只回答发生后怎么办。" copy="基准与冲击使用相同随机路径，差异来自你配置的事件，而不是两次随机抽样的噪声。"/>
    <Panel title="选择压力情景" eyebrow="七类预设"><div className="preset-list">{stressKinds.map(([id,label]) => <button className={kind === id ? "selected" : ""} key={id} onClick={() => select(id)}>{label}{kind === id ? <CircleCheck size={14}/> : <Plus size={14}/>}</button>)}</div></Panel>
    <div className="stress-layout"><Panel title={name} className="sticky-panel"><div className="event-list">{events.map((item) => <article className="event-card" key={item.id}>
        <header><strong>{stressKinds.find(([id]) => id === item.type)?.[1] ?? item.type}</strong><button className="icon-btn" aria-label="移除事件" onClick={() => setEvents(events.filter((value) => value.id !== item.id))}><X size={15}/></button></header>
        <label className="field"><span>发生月份</span><input type="month" value={item.startMonth} onChange={(event) => changeEvent(item.id, { startMonth: event.target.value as typeof item.startMonth })}/></label>
        {item.durationMonths != null && <Field label="持续时间" value={item.durationMonths} suffix="个月" min={1} onChange={(value) => changeEvent(item.id, { durationMonths: value })}/>} 
        {item.type === "both-job-loss" && <QuickOptions values={[6, 12, 24]} value={item.durationMonths ?? 12} suffix="个月" onChange={(value) => changeEvent(item.id, { durationMonths: value })}/>} 
        {item.type === "light-income-loss" && <button type="button" className="duration-toggle" onClick={() => changeEvent(item.id, { durationMonths: item.durationMonths == null ? 24 : undefined })}>{item.durationMonths == null ? "改为 24 个月后恢复" : "设为永久中断"}</button>}
        {(item.type === "male-job-loss" || item.type === "both-job-loss" || item.type === "light-income-loss") && <Field label="保留收入" value={(item.incomeFactor ?? 0) * 100} suffix="%" min={0} max={100} onChange={(value) => changeEvent(item.id, { incomeFactor: value / 100 })}/>} 
        {item.type === "market-crash" && <><Field label="市场跌幅" value={(item.drawdown ?? 0) * 100} suffix="%" min={0} max={100} onChange={(value) => changeEvent(item.id, { drawdown: value / 100 })}/><QuickOptions values={[20, 30, 40]} value={(item.drawdown ?? 0) * 100} suffix="%" onChange={(value) => changeEvent(item.id, { drawdown: value / 100 })}/><Field label="恢复损失比例" value={(item.recoveryFraction ?? 0) * 100} suffix="%" min={0} max={100} onChange={(value) => changeEvent(item.id, { recoveryFraction: value / 100 })}/><Field label="恢复期" value={item.recoveryMonths ?? 36} suffix="个月" min={1} onChange={(value) => changeEvent(item.id, { recoveryMonths: value })}/></>} 
        {item.type === "medical-expense" && <><Field label="一次性自付" value={item.amount ?? 0} suffix="元" min={0} onChange={(value) => changeEvent(item.id, { amount: value })}/><QuickOptions values={[100000, 300000, 500000]} value={item.amount ?? 0} onChange={(value) => changeEvent(item.id, { amount: value })}/></>} 
        {item.type === "expense-increase" && <><Field label="生活费上涨" value={(item.expenseIncrease ?? 0) * 100} suffix="%" min={0} onChange={(value) => changeEvent(item.id, { expenseIncrease: value / 100 })}/><QuickOptions values={[20, 30, 50]} value={(item.expenseIncrease ?? 0) * 100} suffix="%" onChange={(value) => changeEvent(item.id, { expenseIncrease: value / 100 })}/></>}
      </article>)}</div>
      <label className="field"><span>叠加其他事件</span><select value="" onChange={(event) => addEvent(event.target.value)}><option value="">选择事件…</option>{stressKinds.slice(0,6).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      {!(data.riskSettings ?? defaultAppData.riskSettings).confirmed && <p className="connection error">请先到“长期风险模拟”确认波动率假设。</p>}{running ? <><div className="progress"><i style={{ width: `${progress * 100}%` }}/></div><p className="progress-label">正在配对计算 {Math.round(progress * 100)}%</p><button className="secondary full" onClick={cancel}>取消测试</button></> : <button className="primary full" disabled={!(data.riskSettings ?? defaultAppData.riskSettings).confirmed || events.length === 0} onClick={run}><Zap size={17}/> 运行压力测试</button>}{error && <p className="connection error">{error}</p>}</Panel>
      <div>{latest ? <>{stale && <div className="stale-banner"><CircleAlert/>家庭基础数据已变化，这份压力测试是历史结果。</div>}<div className="metric-grid compact"><Metric label="资金充足比例变化" value={`${(latest.impacted.fundingRatio * 100).toFixed(1)}%`} note={`基准 ${(latest.baseline.fundingRatio * 100).toFixed(1)}% · ${((latest.impacted.fundingRatio-latest.baseline.fundingRatio)*100).toFixed(1)} 个百分点`} tone={latest.impacted.fundingRatio < latest.baseline.fundingRatio ? "warn" : "good"}/><Metric label="P10 额外资金缺口" value={money(Math.max(0, latest.baseline.p10EndingAssets-latest.impacted.p10EndingAssets))}/><Metric label="P10 最低现金" value={money(latest.impacted.minimumCashP10)} note={`约 ${currentExpense ? (latest.impacted.minimumCashP10/currentExpense).toFixed(1) : 0} 个月当前支出`}/><Metric label="退休期中位最大回撤" value={percent(latest.impacted.maxDrawdownMedian)} note={`基准 ${percent(latest.baseline.maxDrawdownMedian)}`} tone="warn"/><Metric label="晚年中位资产差异" value={money(latest.impacted.medianEndingAssets-latest.baseline.medianEndingAssets)} note={`冲击后 ${money(latest.impacted.medianEndingAssets)}`} tone={latest.impacted.medianEndingAssets < latest.baseline.medianEndingAssets ? "warn" : "good"}/><Metric label="避免确定性不足的退休年龄" value={latest.safeRetirementAge ? `${latest.safeRetirementAge} 岁` : "65 岁前未恢复"}/></div>
        <Panel title="经重新计算的改善方向" eyebrow="1,000 次快速复算"><div className="improvement-grid">{latest.improvements.map((item) => <article className={item.applicable === false ? "disabled" : ""} key={item.id}><strong>{item.label}</strong>{item.applicable === false ? <><span>不适用</span><small>{item.note}</small></> : <><span>{percent(item.fundingRatio)}</span><small>{item.change >= 0 ? "+" : ""}{(item.change*100).toFixed(1)} 个百分点</small></>}</article>)}</div></Panel>
        <Panel title="本次冲击事件" eyebrow={`种子 ${latest.seed} · 引擎 ${latest.engineVersion}`}><div className="event-summary">{latest.events.map((item) => <div key={item.id}><strong>{stressKinds.find(([id]) => id === item.type)?.[1] ?? item.type}</strong><span>{item.startMonth}{item.durationMonths ? ` · ${item.durationMonths} 个月` : " · 一次或持续生效"}</span></div>)}</div></Panel>
        <Panel title="冲击前后资产路径"><div className="chart x-tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={latest.baseline.annualPaths.map((item,index) => ({ age: Math.round(item.age), 基准中位数: Math.round(item.p50/10000), 冲击中位数: Math.round((latest.impacted.annualPaths[index]?.p50 ?? 0)/10000), 冲击P10: Math.round((latest.impacted.annualPaths[index]?.p10 ?? 0)/10000) }))}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="age"/><YAxis/><Tooltip formatter={(value) => `${value} 万元`}/><Legend/><Line dataKey="基准中位数" stroke="#3f7d68" strokeWidth={3} dot={false}/><Line dataKey="冲击中位数" stroke="#e8b86d" strokeWidth={2} dot={false}/><Line dataKey="冲击P10" stroke="#e57f67" dot={false}/></LineChart></ResponsiveContainer></div></Panel>
        <Panel title="首次资金不足年龄分布"><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={shortfallChart}><CartesianGrid vertical={false} stroke="#ebe8df"/><XAxis dataKey="age"/><YAxis/><Tooltip formatter={(value) => `${(Number(value)*100).toFixed(1)}%`}/><Legend/><Bar dataKey="基准" fill="#8ebaa8"/><Bar dataKey="冲击后" fill="#e57f67"/></BarChart></ResponsiveContainer></div></Panel>
      </> : <Panel title="等待压力测试"><div className="empty"><ShieldAlert/><strong>选择事件并运行</strong><p>系统会用相同随机种子对比冲击前后，不把随机噪声当成事件影响。</p></div></Panel>}</div></div>
  </>;
}

function Advisor({ data, update, aiConnection }: { data: AppData; update: (next: AppData) => void; aiConnection: AIConnection }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (preset?: string) => {
    const content = (preset ?? message).trim(); if (!content || busy) return;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, content, createdAt: new Date().toISOString() };
    const pending = { ...data, conversations: [...data.conversations, userMessage] }; update(pending); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, household: data.household, scenarios: data.scenarios, currentRiskSettings: data.riskSettings, riskResult: data.monteCarloRuns?.[0] ?? null, stressResult: data.stressTestRuns?.[0] ?? null, history: data.conversations.slice(-12), connection: aiConnection }) });
      const payload = await response.json();
      const assistant = { id: crypto.randomUUID(), role: "assistant" as const, content: payload.answer ?? payload.error ?? "AI 暂时无法回答", createdAt: new Date().toISOString() };
      update({ ...pending, conversations: [...pending.conversations, assistant] });
    } catch { update({ ...pending, conversations: [...pending.conversations, { id: crypto.randomUUID(), role: "assistant", content: "连接失败，请检查本地服务与网络。", createdAt: new Date().toISOString() }] }); }
    finally { setBusy(false); }
  };
  const clearConversation = () => { if (data.conversations.length > 0 && window.confirm("清空全部 AI 对话记录？家庭数据和情景不会受影响。")) update({ ...data, conversations: [] }); };
  const saveAdvice = (content: string) => update({ ...data, retirementTasks: [...(data.retirementTasks ?? []), { id: crypto.randomUUID(), title: `跟进 AI 建议：${content.split("\n")[0].slice(0, 32)}`, category: "finance", status: "todo", note: content, custom: true }] });
  return <><PageIntro eyebrow="AI 财务顾问" title="让数字说人话，也让建议有依据。" copy="AI 会结合当前方案、风险模拟、压力测试和最近对话继续追问；没有底层结果时不会编造概率。"/><div className="chat-shell"><div className="chat-tools"><span>{data.conversations.length} 条本地对话 · 随家庭备份导出</span><button className="icon-text" onClick={clearConversation} disabled={data.conversations.length === 0 || busy}><Trash2 size={15}/> 清空对话</button></div><div className="chat-history">{data.conversations.length === 0 ? <div className="ai-welcome"><div className="spark"><Sparkles/></div><h2>今天想推演哪个人生选择？</h2><p>每个回答都会注明真实数据、模型假设、计算结果与判断。</p><div className="prompts"><button onClick={() => ask("根据最新长期风险模拟，我 40 岁半退休最大的三个风险是什么？")}>诊断长期退休风险</button><button onClick={() => ask("解释最新压力测试中最容易出现资金问题的阶段，以及三个改善方案的代价。")}>解释压力测试结果</button><button onClick={() => ask("比较 40 岁和延后两年退休的财务改善与时间代价。")}>40 岁还是 42 岁？</button><button onClick={() => ask("如果男方 38 岁被裁员，女方继续工作到 40 岁，我们还能在昆明半退休吗？")}>38 岁遭遇裁员会怎样？</button><button onClick={() => ask("从当前方案看，最值得优先补充或确认的三项数据是什么？")}>还有哪些数据没补全？</button><button onClick={() => ask("请检查当前家庭现金缓冲是否合理，并说明依据。")}>现金缓冲够不够？</button></div></div> : data.conversations.map((item) => <div className={`message ${item.role}`} key={item.id}><span>{item.role === "user" ? "你" : <Sparkles size={16}/>}</span><div><div>{item.content}</div>{item.role === "assistant" && <button className="advice-task" onClick={() => saveAdvice(item.content)}><ListChecks size={14}/> 转为准备任务</button>}</div></div>)}{busy && <div className="message assistant"><span><Sparkles size={16}/></span><div className="typing"><i/><i/><i/></div></div>}</div><div className="composer"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：最新风险模拟中，最值得优先处理的问题是什么？" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}/><button className="primary" onClick={() => void ask()} disabled={busy}><Play size={17}/> 分析</button></div></div></>;
}

function SettingsView({ data, update, aiConnection, setAIConnection }: { data: AppData; update: (next: AppData) => void; aiConnection: AIConnection; setAIConnection: (next: AIConnection) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [connection, setConnection] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const importFile = async (file?: File) => { if (!file) return; try { const next = await readBackup(file); update(next); setAIConnection({ ...next.aiSettings, apiKey: aiConnection.apiKey }); setConnection("备份已恢复，AI Key 仍使用本机设置"); } catch (error) { setConnection(error instanceof Error ? error.message : "恢复失败"); } };
  const set = (key: keyof AIConnection, value: string) => setAIConnection({ ...aiConnection, [key]: value });
  const test = async () => {
    setTesting(true); setConnection("");
    try {
      const response = await fetch("/api/ai/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiConnection) });
      const payload = await response.json(); setConnection(payload.ok ? `${payload.model} 连接成功` : payload.error);
    } catch { setConnection("连接失败，请检查地址和本地服务"); }
    finally { setTesting(false); }
  };
  return <>
    <PageIntro eyebrow="设置中心" title="把模型接进你的计划。" copy="模型地址、名称和 AI 对话会随家庭备份迁移；API Key 只保留在当前浏览器会话。"/>
    <section className="connection-card">
      <div className="connection-title"><span><Cog size={22}/></span><div><h2>接口提供商与连接凭证</h2><p>配置 AI 财务顾问使用的模型服务</p></div></div>
      <label className="credential-field required"><span>提供商类型</span><select value={aiConnection.provider} onChange={(event) => set("provider", event.target.value)}><option value="openai-compatible">OpenAI 兼容接口</option></select><small>支持 OpenAI 兼容协议的云端或内网模型服务。</small></label>
      <div className="credential-grid">
        <label className="credential-field required"><span>基础请求接口（Base URL）</span><input value={aiConnection.baseUrl} onChange={(event) => set("baseUrl", event.target.value)} placeholder="https://api.openai.com/v1" autoComplete="url"/></label>
        <label className="credential-field required"><span>模型标识名称（Model Name）</span><input value={aiConnection.model} onChange={(event) => set("model", event.target.value)} placeholder="gpt-5-mini" autoComplete="off"/></label>
      </div>
      <label className="credential-field"><span>身份鉴权 Key（API Key）</span><div className="secret-input"><input type={showKey ? "text" : "password"} value={aiConnection.apiKey} onChange={(event) => set("apiKey", event.target.value)} placeholder="未启用鉴权时可留空" autoComplete="off"/><button type="button" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>
      <div className="connection-actions"><button className="secondary test-button" disabled={testing || !aiConnection.baseUrl || !aiConnection.model} onClick={() => void test()}><Zap size={17}/>{testing ? "正在测试…" : "测试模型连通性"}</button>{connection && <p className={connection.includes("成功") ? "connection success" : "connection error"}>{connection}</p>}</div>
      <p className="credential-note">未启用鉴权时可留空。内网 HTTP 地址仅适合本机或受信网络部署。</p>
    </section>
    <div className="split-grid"><Panel title="数据管理" eyebrow="IndexedDB 本地存储"><div className="settings-actions"><button className="primary" onClick={() => downloadBackup(data)}><Download size={17}/> 导出完整 JSON 备份</button><button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={17}/> 导入备份</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => void importFile(event.target.files?.[0])}/></div><div className="privacy-note"><Landmark/><div><strong>备份包含得更完整</strong><p>家庭资料、生命周期、社保养老金、提取策略、准备任务、风险结果和 AI 对话都会导出；原始随机路径和 API Key 不会导出。</p></div></div></Panel><Panel title="隐私与安全"><div className="setting-list"><div><span>风险结果保存</span><strong>聚合结果与种子</strong></div><div><span>原始 10,000 条路径</span><strong>不保存</strong></div><div><span>模型地址与名称</span><strong>随备份导出</strong></div><div><span>API Key</span><strong>仅当前浏览器会话</strong></div><div><span>AI 未确认自动修改</span><strong>禁止</strong></div></div></Panel></div>
  </>;
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></section>; }
function categoryName(value: string) { return ({ cash: "现金", stock: "股票", bond: "债券", insurance: "保险", provident: "公积金", property: "房产" } as Record<string, string>)[value] ?? value; }

export function FireApp() {
  const [data, setData] = useState<AppData>(defaultAppData);
  const [aiConnection, setAIConnectionState] = useState<AIConnection>({ ...defaultAppData.aiSettings, apiKey: "" });
  const [view, setView] = useState<View>("dashboard");
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const apiKey = sessionStorage.getItem("fire40-ai-key") ?? "";
    void loadData().then((value) => { setData(value); void saveData(value); setAIConnectionState({ ...value.aiSettings, apiKey }); setReady(true); });
  }, []);
  useEffect(() => {
    if (!ready) return;
    if ((data.household.presetRevision ?? 0) >= 4 && data.riskSettings && Array.isArray(data.monteCarloRuns) && Array.isArray(data.stressTestRuns) && Array.isArray(data.withdrawalRuns) && Array.isArray(data.retirementTasks)) return;
    const migrated = normalizeData(data); setData(migrated); void saveData(migrated);
  }, [data, ready]);
  const setAIConnection = (next: AIConnection) => {
    setAIConnectionState(next); sessionStorage.setItem("fire40-ai-key", next.apiKey);
    setData((current) => {
      const updated = { ...current, aiSettings: { provider: next.provider, baseUrl: next.baseUrl, model: next.model } };
      void saveData(updated); return updated;
    });
  };
  const result = useMemo(() => runSimulation(data.household), [data.household]);
  const update = (next: AppData) => { setData(next); setDirty(true); };
  const changeHousehold = (household: HouseholdSnapshot) => update({ ...data, household: { ...household, updatedAt: new Date().toISOString() } });
  const persist = async () => { await saveData(data); setDirty(false); };
  const saveScenario = () => {
    const scenario: ScenarioSnapshot = { id: crypto.randomUUID(), name: `${data.household.settings.maleRetirementAge} 岁双人半退休 · ${data.scenarios.length + 1}`, createdAt: new Date().toISOString(), input: clone(data.household), result };
    const next = { ...data, scenarios: [scenario, ...data.scenarios] }; setData(next); setDirty(false); void saveData(next); setView("scenarios");
  };
  const updateAndPersist = (next: AppData) => { setData(next); setDirty(false); void saveData(next); };
  const savePreset = (preset: string) => {
    const input = clone(data.household);
    const male = input.members.find((member) => member.id === "male")!;
    const female = input.members.find((member) => member.id === "female")!;
    input.settings.maleRetirementAge = 40; input.settings.femaleRetirementAge = 40;
    input.settings.maleLightIncome = 2000; input.settings.femaleLightIncome = 2000;
    delete input.settings.maleJobLossMonth; delete input.settings.maleJobLossMonths; delete input.settings.shock;
    const names: Record<string, string> = { normal: "正常工作到 40 岁", "job-loss": "男方提前失业一年", "both-light": "40 岁双人轻工作", "male-light": "仅男方轻工作", "female-light": "仅女方轻工作", "no-work": "双方零工作收入", crash: "退休首年下跌 30%" };
    if (preset === "job-loss") { input.settings.maleJobLossMonth = addMonths(input.baseMonth, Math.max(0, (38 - (male.age ?? 34)) * 12)); input.settings.maleJobLossMonths = 12; }
    if (preset === "male-light") input.settings.femaleLightIncome = 0;
    if (preset === "female-light") input.settings.maleLightIncome = 0;
    if (preset === "no-work") { input.settings.maleLightIncome = 0; input.settings.femaleLightIncome = 0; }
    if (preset === "crash") input.settings.shock = { month: addMonths(input.baseMonth, Math.max((40 - (male.age ?? 34)) * 12, (40 - (female.age ?? 35)) * 12)), drawdown: 0.3 };
    const scenario: ScenarioSnapshot = { id: crypto.randomUUID(), name: names[preset], createdAt: new Date().toISOString(), input, result: runSimulation(input) };
    updateAndPersist({ ...data, scenarios: [scenario, ...data.scenarios] });
  };
  const removeScenario = (id: string) => updateAndPersist({ ...data, scenarios: data.scenarios.filter((scenario) => scenario.id !== id) });
  const render = () => {
    if (view === "dashboard") return <Dashboard data={data} result={result} setView={setView}/>;
    if (view === "risk-center") return <RetirementRiskCenter data={data} result={result} setView={setView}/>;
    if (view === "family") return <Family household={data.household} change={changeHousehold}/>;
    if (view === "simulator") return <Simulator household={data.household} result={result} change={changeHousehold} saveScenario={saveScenario}/>;
    if (view === "risk") return <RiskSimulation data={data} update={updateAndPersist}/>;
    if (view === "stress") return <StressCenter data={data} update={updateAndPersist}/>;
    if (view === "withdrawal") return <WithdrawalStrategies data={data} update={updateAndPersist}/>;
    if (view === "lifecycle") return <Lifecycle household={data.household} change={changeHousehold}/>;
    if (view === "protection") return <Protection household={data.household} change={changeHousehold}/>;
    if (view === "checklist") return <RetirementChecklist data={data} update={updateAndPersist}/>;
    if (view === "housing") return <Housing household={data.household} result={result} change={changeHousehold}/>;
    if (view === "investments") return <Investments household={data.household} result={result} change={changeHousehold}/>;
    if (view === "scenarios") return <Scenarios data={data} saveScenario={saveScenario} savePreset={savePreset} removeScenario={removeScenario}/>;
    if (view === "ai") return <Advisor data={data} update={updateAndPersist} aiConnection={aiConnection}/>;
    return <SettingsView data={data} update={updateAndPersist} aiConnection={aiConnection} setAIConnection={setAIConnection}/>;
  };
  if (!ready) return <div className="loading"><PiggyBank/><span>正在整理家庭账本…</span></div>;
  return <div className="app-shell">
    <aside className={menu ? "open" : ""}><div className="brand"><div><span>F</span><i/></div><strong>FIRE 40</strong><button aria-label="关闭导航" className="mobile-close" onClick={() => setMenu(false)}><X/></button></div><div className="family-chip"><span>家庭计划</span><strong>{data.household.householdName}</strong><small>{data.household.baseMonth} · 人民币</small></div><nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMenu(false); }}><item.icon size={19}/><span>{item.label}</span>{view === item.id && <i/>}</button>)}</nav><div className="sidebar-foot"><div className="local-badge"><CircleCheck size={16}/><span>数据仅存本地</span></div><p>FIRE 40 不构成投资建议</p></div></aside>
    {menu && <button className="backdrop" onClick={() => setMenu(false)} aria-label="关闭导航"/>}
    <main><header className="topbar"><button aria-label="打开导航" className="menu-btn" onClick={() => setMenu(true)}><Menu/></button><div><span className={dirty ? "status-dot dirty" : "status-dot"}/><span>{dirty ? "有未保存修改" : "本地方案已保存"}</span></div><div className="top-actions"><span className="soft-pill">基准月 {data.household.baseMonth}</span><button className="secondary" onClick={() => void persist()} disabled={!dirty}><Save size={16}/> 保存</button><button className="run" onClick={() => setView("simulator")}><Play size={16}/> 运行模拟</button></div></header><div className="content">{render()}</div></main>
    <nav className="mobile-nav">{nav.slice(0, 4).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button>)}<button onClick={() => setMenu(true)}><Menu/><span>更多</span></button></nav>
  </div>;
}
