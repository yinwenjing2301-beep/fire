"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleAlert, CircleCheck, Plus, ShieldAlert, X, Zap } from "lucide-react";
import { buildStressPreset } from "@/engine/risk";
import { defaultAppData } from "@/lib/defaults";
import type { AppData, StressEvent, StressTestSnapshot } from "@/types/finance";
import { Field, Metric, PageIntro, Panel, QuickOptions, clone, money, percent, sameRiskSettings, startRiskWorker } from "../ui";
export const stressKinds = [["male-job-loss","男方提前裁员"],["both-job-loss","夫妻同时失业"],["market-crash","退休初期暴跌"],["light-income-loss","轻工作中断"],["medical-expense","重大医疗开支"],["expense-increase","生活费上涨"],["combined","多重风险叠加"]];

export function StressCenter({ data, update }: { data: AppData; update: (next: AppData) => void }) {
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