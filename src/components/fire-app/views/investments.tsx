"use client";

import { CircleAlert } from "lucide-react";
import type { HouseholdSnapshot, SimulationResult } from "@/types/finance";
import { Field, Metric, PageIntro, Panel, clone, money, percent } from "../ui";
export function Investments({ household, result, change }: { household: HouseholdSnapshot; result: SimulationResult; change: (next: HouseholdSnapshot) => void }) {
  const stocks = household.accounts.filter((a) => a.category === "stock").reduce((s, a) => s + a.balance, 0);
  const cash = household.accounts.filter((a) => a.category === "cash").reduce((s, a) => s + a.balance, 0);
  const total = stocks + cash;
  const stressedLoss = stocks * 0.3;
  return <><PageIntro eyebrow="投资配置" title="回报是变量，结构才是选择。" copy="这里不预测产品收益，只把组合假设、风险暴露与退休计划连接起来。"/><div className="metric-grid"><Metric label="股票类占比" value={percent(stocks / total)} note={money(stocks)}/><Metric label="现金类占比" value={percent(cash / total)} note={money(cash)}/><Metric label="组合回报假设" value={percent(household.settings.annualReturn)} note="非保证收益"/><Metric label="股票下跌 30% 损失" value={money(stressedLoss)} tone="warn"/></div><div className="split-grid"><Panel title="当前可投资组合"><div className="allocation-bars"><div><span>股票类</span><i><b style={{ width: `${stocks / total * 100}%` }}/></i><strong>{percent(stocks / total)}</strong></div><div><span>现金类</span><i><b style={{ width: `${cash / total * 100}%`, background: "#e8b86d" }}/></i><strong>{percent(cash / total)}</strong></div></div><Field label="用于模拟的年化回报" value={household.settings.annualReturn * 100} suffix="%" step={0.1} onChange={(v) => { const next = clone(household); next.settings.annualReturn = v / 100; change(next); }}/></Panel><Panel title="回撤压力测试"><div className="stress"><CircleAlert/><strong>退休首年下跌 30%</strong><p>当前股票资产将产生约 {money(stressedLoss)} 的账面回撤。可在压力测试中选择「退休初期暴跌」事件，查看对长期资金充足度的影响。</p><span>确定性引擎不会把这一结果包装成“成功概率”。</span></div></Panel></div></>;
}