"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CircleAlert, CircleCheck, Play, RefreshCw } from "lucide-react";
import { defaultAppData } from "@/lib/defaults";
import type { AppData, MonteCarloAggregate, MonteCarloSnapshot } from "@/types/finance";
import { Field, Metric, PageIntro, Panel, clone, money, percent, sameRiskSettings, startRiskWorker } from "../ui";
export function RiskSimulation({ data, update }: { data: AppData; update: (next: AppData) => void }) {
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