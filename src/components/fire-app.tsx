"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, Building2, ChartNoAxesCombined, ChevronRight, CircleCheck,
  Gauge, GraduationCap, HeartPulse, Home, ListChecks, Menu, PiggyBank, Play, Save, Settings, ShieldAlert, Users, WalletCards, X
} from "lucide-react";
import { runSimulation } from "@/engine/simulate";
import { defaultAppData } from "@/lib/defaults";
import { loadData, normalizeData, saveData } from "@/lib/storage";
import type { AppData, HouseholdSnapshot } from "@/types/finance";
import { AIConnection, type NavItem, type View } from "./fire-app/ui";
import { Dashboard } from "./fire-app/views/dashboard";
import { Family } from "./fire-app/views/family";
import { Simulator } from "./fire-app/views/simulator";
import { Housing } from "./fire-app/views/housing";
import { Investments } from "./fire-app/views/investments";
import { RiskSimulation } from "./fire-app/views/risk";
import { Lifecycle } from "./fire-app/views/lifecycle";
import { Protection } from "./fire-app/views/protection";
import { WithdrawalStrategies } from "./fire-app/views/withdrawal";
import { RetirementChecklist } from "./fire-app/views/checklist";
import { StressCenter } from "./fire-app/views/stress";
import { Advisor } from "./fire-app/views/advisor";
import { SettingsView } from "./fire-app/views/settings";

const dashboardNav: NavItem = { id: "dashboard", label: "总览", icon: Home };
const settingsNav: NavItem = { id: "settings", label: "设置中心", icon: Settings };
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "家庭资料", items: [
    { id: "family", label: "家庭财务", icon: Users },
    { id: "lifecycle", label: "生命周期规划", icon: GraduationCap },
    { id: "housing", label: "住房规划", icon: Building2 },
    { id: "protection", label: "社保与养老金", icon: HeartPulse },
    { id: "investments", label: "投资配置", icon: ChartNoAxesCombined }
  ] },
  { label: "退休方案", items: [
    { id: "simulator", label: "FIRE 模拟器", icon: Gauge },
    { id: "withdrawal", label: "退休提取策略", icon: WalletCards }
  ] },
  { label: "风险验证", items: [
    { id: "risk", label: "长期风险模拟", icon: Activity },
    { id: "stress", label: "压力测试", icon: ShieldAlert }
  ] },
  { label: "行动与建议", items: [
    { id: "checklist", label: "退休准备清单", icon: ListChecks },
    { id: "ai", label: "AI 财务顾问", icon: Bot }
  ] }
];
const mobileNav = [dashboardNav, navGroups[0].items[0], navGroups[1].items[0], navGroups[2].items[0]];

export function FireApp() {
  const [data, setData] = useState<AppData>(defaultAppData);
  const [aiConnection, setAIConnectionState] = useState<AIConnection>({ ...defaultAppData.aiSettings, apiKey: "" });
  const [view, setView] = useState<View>("dashboard");
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
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
  const updateAndPersist = (next: AppData) => { setData(next); setDirty(false); void saveData(next); };
  const render = () => {
    if (view === "dashboard") return <Dashboard data={data} result={result} setView={setView}/>;
    if (view === "family") return <Family household={data.household} change={changeHousehold}/>;
    if (view === "simulator") return <Simulator household={data.household} result={result} change={changeHousehold}/>;
    if (view === "risk") return <RiskSimulation data={data} update={updateAndPersist}/>;
    if (view === "stress") return <StressCenter data={data} update={updateAndPersist}/>;
    if (view === "withdrawal") return <WithdrawalStrategies data={data} update={updateAndPersist}/>;
    if (view === "lifecycle") return <Lifecycle household={data.household} change={changeHousehold}/>;
    if (view === "protection") return <Protection household={data.household} change={changeHousehold}/>;
    if (view === "checklist") return <RetirementChecklist data={data} update={updateAndPersist}/>;
    if (view === "housing") return <Housing household={data.household} result={result} change={changeHousehold}/>;
    if (view === "investments") return <Investments household={data.household} result={result} change={changeHousehold}/>;
    if (view === "ai") return <Advisor data={data} update={updateAndPersist} aiConnection={aiConnection}/>;
    return <SettingsView data={data} update={updateAndPersist} aiConnection={aiConnection} setAIConnection={setAIConnection}/>;
  };
  if (!ready) return <div className="loading"><PiggyBank/><span>正在整理家庭账本…</span></div>;
  return <div className="app-shell">
    <aside className={menu ? "open" : ""}><div className="brand"><div><span>F</span><i/></div><strong>FIRE 40</strong><button aria-label="关闭导航" className="mobile-close" onClick={() => setMenu(false)}><X/></button></div><div className="family-chip"><span>家庭计划</span><strong>{data.household.householdName}</strong><small>{data.household.baseMonth} · 人民币</small></div><nav aria-label="规划功能"><button className={view === dashboardNav.id ? "active" : ""} onClick={() => { setView(dashboardNav.id); setMenu(false); }}><dashboardNav.icon size={19}/><span>{dashboardNav.label}</span>{view === dashboardNav.id && <i/>}</button>{navGroups.map((group) => { const expanded = expandedGroups.has(group.label); const containsActive = group.items.some((item) => item.id === view); return <section className="nav-section" key={group.label}><button type="button" className={`nav-section-toggle ${containsActive ? "contains-active" : ""}`} aria-expanded={expanded} onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(group.label)) next.delete(group.label); else next.add(group.label); return next; })}><span>{group.label}</span><ChevronRight size={15} className={expanded ? "expanded" : ""}/></button>{expanded && <div className="nav-section-items">{group.items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMenu(false); }}><item.icon size={18}/><span>{item.label}</span>{view === item.id && <i/>}</button>)}</div>}</section>; })}</nav><div className="sidebar-settings"><button className={view === settingsNav.id ? "active" : ""} onClick={() => { setView(settingsNav.id); setMenu(false); }}><settingsNav.icon size={18}/><span>{settingsNav.label}</span>{view === settingsNav.id && <i/>}</button></div><div className="sidebar-foot"><div className="local-badge"><CircleCheck size={16}/><span>数据仅存本地</span></div><p>FIRE 40 不构成投资建议</p></div></aside>
    {menu && <button className="backdrop" onClick={() => setMenu(false)} aria-label="关闭导航"/>}
    <main><header className="topbar"><button aria-label="打开导航" className="menu-btn" onClick={() => setMenu(true)}><Menu/></button><div><span className={dirty ? "status-dot dirty" : "status-dot"}/><span>{dirty ? "有未保存修改" : "本地方案已保存"}</span></div><div className="top-actions"><span className="soft-pill">基准月 {data.household.baseMonth}</span><button className="secondary" onClick={() => void persist()} disabled={!dirty}><Save size={16}/> 保存</button><button className="run" onClick={() => setView("simulator")}><Play size={16}/> 运行模拟</button></div></header><div className="content">{render()}</div></main>
    <nav className="mobile-nav">{mobileNav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button>)}<button onClick={() => setMenu(true)}><Menu/><span>更多</span></button></nav>
  </div>;
}
