"use client";

import { Plus } from "lucide-react";
import { RISK_ENGINE_VERSION } from "@/engine/risk";
import type { AppData, HouseholdSnapshot, SimulationResult } from "@/types/finance";

export type View = "dashboard" | "family" | "simulator" | "risk" | "stress" | "withdrawal" | "lifecycle" | "protection" | "checklist" | "housing" | "investments" | "ai" | "settings";
export type AIConnection = { provider: "openai-compatible"; baseUrl: string; model: string; apiKey: string };
export type NavItem = { id: View; label: string; icon: typeof Plus };

export const colors = ["#3f7d68", "#8ebaa8", "#e8b86d", "#e57f67", "#7c8ea3", "#c8bca7"];
export const money = (value: number | null, compact = false) => value == null
  ? "待补充"
  : new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(value);
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export const clone = <T,>(value: T): T => structuredClone(value);
export const sameRiskSettings = (left: AppData["riskSettings"] | undefined, right: AppData["riskSettings"]) => Boolean(left)
  && left!.annualVolatility === right.annualVolatility
  && left!.iterations === right.iterations
  && left!.seed === right.seed
  && left!.endAge === right.endAge;

type WorkerRequest = Record<string, unknown> & { id: string };
export function startRiskWorker(request: WorkerRequest, handlers: { progress: (value: number) => void; result: (value: unknown, engineVersion: string, runtimeMs: number) => void; error: (message: string) => void }) {
  const worker = new Worker(new URL("../../workers/risk.worker.ts", import.meta.url));
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

export function Field({ label, value, onChange, suffix, step = 1, min, max }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <em>{suffix}</em>}</span>
    </label>
  );
}

export function NullableField({ label, value, onChange, suffix, step = 1, min = 0, placeholder = "待补充" }: { label: string; value: number | null; onChange: (value: number | null) => void; suffix?: string; step?: number; min?: number; placeholder?: string }) {
  return <label className="field"><span>{label}</span><span className="input-wrap"><input type="number" value={value ?? ""} min={min} step={step} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}/>{suffix && <em>{suffix}</em>}</span></label>;
}

export function QuickOptions({ values, value, onChange, suffix = "" }: { values: number[]; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <div className="quick-options">{values.map((option) => <button type="button" className={value === option ? "selected" : ""} key={option} onClick={() => onChange(option)}>{option}{suffix}</button>)}</div>;
}

export function Metric({ label, value, note, tone = "normal" }: { label: string; value: string; note?: string; tone?: "normal" | "good" | "warn" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

export function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></section>; }
export function categoryName(value: string) { return ({ cash: "现金", stock: "股票", bond: "债券", insurance: "保险", provident: "公积金", property: "房产" } as Record<string, string>)[value] ?? value; }

// Shared prop shapes across view components
export type HouseholdViewProps = { household: HouseholdSnapshot; change: (next: HouseholdSnapshot) => void };
export type WithResult = { result: SimulationResult };
export type AppDataViewProps = { data: AppData; update: (next: AppData) => void };
