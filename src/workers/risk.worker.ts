/// <reference lib="webworker" />

import { RISK_ENGINE_VERSION, runMonteCarlo, runStressComparison, runWithdrawalComparison } from "@/engine/risk";
import type { HouseholdSnapshot, MonteCarloInput, RiskModelSettings, StressEvent } from "@/types/finance";

type Request =
  | { id: string; type: "monte-carlo"; input: MonteCarloInput }
  | { id: string; type: "stress"; name: string; household: HouseholdSnapshot; settings: RiskModelSettings; events: StressEvent[] }
  | { id: string; type: "withdrawal-compare"; household: HouseholdSnapshot; settings: RiskModelSettings };

self.onmessage = (message: MessageEvent<Request>) => {
  const request = message.data;
  try {
    const started = performance.now();
    const progress = (value: number) => self.postMessage({ id: request.id, type: "progress", progress: value });
    const result = request.type === "monte-carlo"
      ? runMonteCarlo(request.input, progress)
      : request.type === "stress"
        ? runStressComparison(request.name, request.household, request.settings, request.events, progress)
        : runWithdrawalComparison(request.household, request.settings, progress);
    const runtimeMs = Math.round((performance.now() - started) * 100) / 100;
    self.postMessage({ id: request.id, type: "result", result, engineVersion: RISK_ENGINE_VERSION, runtimeMs });
  } catch (error) {
    self.postMessage({ id: request.id, type: "error", error: error instanceof Error ? error.message : "风险模拟失败" });
  }
};

export {};
