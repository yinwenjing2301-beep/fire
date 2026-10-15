"use client";

import { defaultAppData, defaultRetirementTasks } from "./defaults";
import type { AppData } from "@/types/finance";

const DB_NAME = "fire40";
const STORE = "app";
const KEY = "primary";

export function normalizeData(value: Partial<AppData>): AppData {
  if (value?.household?.version !== 1) throw new Error("不是有效的 FIRE 40 数据");
  const household = structuredClone(value.household);
  const parentIds = new Set(["elder", "male-father", "male-mother", "female-father", "female-mother"]);
  const members = household.members.filter((member) => !parentIds.has(member.id) && !(member.name === "老人" && member.role === "家庭照护"));
  if (members.length !== household.members.length) {
    household.members = members;
    household.updatedAt = new Date().toISOString();
  }
  if ((household.presetRevision ?? 0) < 2) {
    const eldercare = household.expenses.find((expense) => expense.id === "eldercare");
    if (eldercare) { eldercare.name = "双方父母养老支出"; eldercare.monthlyAmount = 5000; }
    const provident = household.accounts.find((account) => account.id === "provident");
    if (provident) provident.retirementUsable = true;
    household.presetRevision = 2;
    household.updatedAt = new Date().toISOString();
  }
  if ((household.presetRevision ?? 0) < 3) {
    if (household.settings.maleLightIncome === 4000 && household.settings.femaleLightIncome === 4000) {
      household.settings.maleLightIncome = 2000;
      household.settings.femaleLightIncome = 2000;
    }
    household.presetRevision = 3;
    household.updatedAt = new Date().toISOString();
  }
  if ((household.presetRevision ?? 0) < 4) {
    household.lifecycle = structuredClone(defaultAppData.household.lifecycle);
    household.socialSecurity = structuredClone(defaultAppData.household.socialSecurity);
    household.withdrawalStrategy = structuredClone(defaultAppData.household.withdrawalStrategy);
    household.presetRevision = 4;
    household.updatedAt = new Date().toISOString();
  }
  household.lifecycle = Array.isArray(household.lifecycle) ? household.lifecycle : structuredClone(defaultAppData.household.lifecycle);
  let lifecycleRepaired = false;
  for (const rule of household.lifecycle) {
    if (rule.id === "edu-kindergarten" && !rule.sourceExpenseId) { rule.sourceExpenseId = "kindergarten"; lifecycleRepaired = true; }
    if (rule.id === "eldercare-current" && !rule.sourceExpenseId) { rule.sourceExpenseId = "eldercare"; lifecycleRepaired = true; }
  }
  if (lifecycleRepaired) household.updatedAt = new Date().toISOString();
  household.socialSecurity = Array.isArray(household.socialSecurity) ? household.socialSecurity : structuredClone(defaultAppData.household.socialSecurity);
  household.withdrawalStrategy = { ...defaultAppData.household.withdrawalStrategy, ...(household.withdrawalStrategy ?? {}) };
  const riskSettings = { ...defaultAppData.riskSettings, ...(value.riskSettings ?? {}) };
  const annualVolatility = Number(riskSettings.annualVolatility);
  riskSettings.annualVolatility = Number.isFinite(annualVolatility) ? Math.min(1, Math.max(0, annualVolatility)) : defaultAppData.riskSettings.annualVolatility;
  riskSettings.iterations = riskSettings.iterations === 1000 ? 1000 : 10000;
  const seed = Number(riskSettings.seed);
  riskSettings.seed = Number.isFinite(seed) ? seed >>> 0 : defaultAppData.riskSettings.seed;
  riskSettings.endAge = Math.min(110, Math.max(80, Number(riskSettings.endAge) || 100));
  return {
    household,
    scenarios: Array.isArray(value.scenarios) ? value.scenarios : [],
    conversations: Array.isArray(value.conversations) ? value.conversations : [],
    aiSettings: { ...defaultAppData.aiSettings, ...(value.aiSettings ?? {}) },
    riskSettings,
    monteCarloRuns: Array.isArray(value.monteCarloRuns) ? value.monteCarloRuns : [],
    stressTestRuns: Array.isArray(value.stressTestRuns) ? value.stressTestRuns : [],
    withdrawalRuns: Array.isArray(value.withdrawalRuns) ? value.withdrawalRuns : [],
    retirementTasks: Array.isArray(value.retirementTasks) ? value.retirementTasks : structuredClone(defaultRetirementTasks)
  };
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadData(): Promise<AppData> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => {
      try { resolve(request.result ? normalizeData(request.result as Partial<AppData>) : structuredClone(defaultAppData)); }
      catch { resolve(structuredClone(defaultAppData)); }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveData(data: AppData): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(data, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function downloadBackup(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fire40-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readBackup(file: File): Promise<AppData> {
  const parsed = JSON.parse(await file.text()) as Partial<AppData>;
  if (!Array.isArray(parsed.scenarios)) throw new Error("不是有效的 FIRE 40 备份文件");
  return normalizeData(parsed);
}
