export type YearMonth = `${number}-${string}`;
export type Money = string;

export type AccountCategory =
  | "cash"
  | "stock"
  | "bond"
  | "insurance"
  | "provident"
  | "property";

export interface FamilyMember {
  id: string;
  name: string;
  role: string;
  age: number | null;
  occupation: string;
  monthlyIncome: number;
  providentContribution: number;
  retirementAge: number | null;
}

export interface FinancialAccount {
  id: string;
  name: string;
  category: AccountCategory;
  balance: number;
  currency: "CNY" | "USD" | "HKD";
  liquid: boolean;
  retirementUsable: boolean;
  note?: string;
}

export interface ExpenseItem {
  id: string;
  name: string;
  monthlyAmount: number;
  inflationRate: number;
}

export interface HousingPlan {
  enabled: boolean;
  city: string;
  purchaseMonth: YearMonth;
  unitPrice: number;
  area: number;
  downPayment: number;
  renovation: number;
  otherCosts: number;
  loanAnnualRate: number;
  loanYears: number;
  loanType: "equal-payment" | "equal-principal";
  providentWithdrawal: number;
}

export interface SimulationSettings {
  mode: "fixed" | "phased";
  annualReturn: number;
  transitionReturn: number;
  retirementReturn: number;
  inflationRate: number;
  maleRetirementAge: number;
  femaleRetirementAge: number;
  maleLightIncome: number;
  femaleLightIncome: number;
  retirementMonthlyExpense: number;
  withdrawalRate: number;
  cashBufferMonths: number;
  endAge: number;
  shock?: { month: YearMonth; drawdown: number };
  maleJobLossMonth?: YearMonth;
  maleJobLossMonths?: number;
}

export type LifecycleExpenseCategory = "education" | "eldercare" | "medical" | "living" | "insurance" | "other";

export interface LifecycleExpenseRule {
  id: string;
  name: string;
  category: LifecycleExpenseCategory;
  memberId?: string;
  sourceExpenseId?: string;
  startMonth: YearMonth;
  endMonth?: YearMonth;
  monthlyAmount: number | null;
  annualAmount: number | null;
  oneTimeAmount: number | null;
  inflationRate: number;
  mode: "additional" | "included";
  essential: boolean;
}

export interface SocialSecurityPlan {
  memberId: "male" | "female";
  currentRegion: string;
  paidYears: number | null;
  continueContributions: boolean;
  futureRegion: string;
  monthlyContribution: number | null;
  medicalCoverage: "employee" | "resident" | "flexible" | "unknown";
  annualCommercialPremium: number | null;
  pensionStartAge: number | null;
  estimatedMonthlyPension: number | null;
  pensionConfirmed: boolean;
  note: string;
}

export interface WithdrawalStrategySettings {
  type: "fixed-real" | "fixed-percent" | "flexible" | "cash-buffer";
  annualRate: number;
  necessaryMonthlyExpense: number;
  discretionaryMonthlyExpense: number;
  drawdownTrigger: number;
  discretionaryReduction: number;
  cashBufferMonths: number;
}

export interface HouseholdSnapshot {
  version: 1;
  presetRevision?: number;
  householdName: string;
  baseMonth: YearMonth;
  currency: "CNY";
  members: FamilyMember[];
  accounts: FinancialAccount[];
  expenses: ExpenseItem[];
  housing: HousingPlan;
  settings: SimulationSettings;
  lifecycle: LifecycleExpenseRule[];
  socialSecurity: SocialSecurityPlan[];
  withdrawalStrategy: WithdrawalStrategySettings;
  updatedAt: string;
}

export interface MonthlyLedgerEntry {
  month: YearMonth;
  youngerAge: number;
  cash: number;
  investments: number;
  provident: number;
  property: number;
  debt: number;
  netWorth: number;
  workIncome: number;
  lightIncome: number;
  expense: number;
  mortgage: number;
  withdrawal: number;
  shortfall: number;
  pensionIncome: number;
  lifecycleExpense: number;
  protectionExpense: number;
  spendingCut: number;
}

export interface SimulationSummary {
  investableNow: number;
  retirementAssets: number | null;
  afterPurchaseAssets: number | null;
  fireTarget: number;
  firstYearWithdrawal: number;
  minimumCash: number;
  firstShortfallMonth: YearMonth | null;
  endingAssets: number;
  retirementMonth: YearMonth;
  runtimeMs: number;
}

export interface RiskFinding {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface SimulationResult {
  engineVersion: string;
  summary: SimulationSummary;
  ledger: MonthlyLedgerEntry[];
  risks: RiskFinding[];
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: string;
  input: HouseholdSnapshot;
  result: SimulationResult;
}

export interface RiskModelSettings {
  annualVolatility: number;
  iterations: number;
  seed: number;
  confirmed: boolean;
  endAge: number;
}

export type StressEventType =
  | "male-job-loss"
  | "both-job-loss"
  | "market-crash"
  | "light-income-loss"
  | "medical-expense"
  | "expense-increase";

export interface StressEvent {
  id: string;
  type: StressEventType;
  startMonth: YearMonth;
  durationMonths?: number;
  incomeFactor?: number;
  drawdown?: number;
  recoveryFraction?: number;
  recoveryMonths?: number;
  amount?: number;
  expenseIncrease?: number;
}

export interface PercentilePoint {
  month: YearMonth;
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloAggregate {
  fundingRatio: number;
  medianEndingAssets: number;
  p10EndingAssets: number;
  mostCommonShortfallAge: number | null;
  maxDrawdownMedian: number;
  minimumCashP10: number;
  lifestyleStabilityMedian: number;
  annualPaths: PercentilePoint[];
  retirementDecadePaths: Pick<PercentilePoint, "month" | "age" | "p10" | "p50" | "p90">[];
  shortfallByAge: { age: number; count: number; percentage: number }[];
}

export interface MonteCarloInput {
  household: HouseholdSnapshot;
  settings: RiskModelSettings;
  events: StressEvent[];
}

export interface MonteCarloSnapshot {
  id: string;
  name: string;
  createdAt: string;
  householdUpdatedAt: string;
  engineVersion: string;
  runtimeMs: number;
  input: MonteCarloInput;
  result: MonteCarloAggregate;
}

export interface StressImprovement {
  id: "reduce-expense" | "increase-income" | "delay-retirement";
  label: string;
  fundingRatio: number;
  change: number;
  applicable: boolean;
  note?: string;
}

export interface StressTestSnapshot {
  id: string;
  name: string;
  createdAt: string;
  householdUpdatedAt: string;
  engineVersion: string;
  runtimeMs: number;
  seed: number;
  events: StressEvent[];
  input: MonteCarloInput;
  baseline: MonteCarloAggregate;
  impacted: MonteCarloAggregate;
  safeRetirementAge: number | null;
  improvements: StressImprovement[];
}

export interface WithdrawalComparisonSnapshot {
  id: string;
  createdAt: string;
  householdUpdatedAt: string;
  engineVersion: string;
  runtimeMs: number;
  seed: number;
  input: { household: HouseholdSnapshot; settings: RiskModelSettings };
  results: { type: WithdrawalStrategySettings["type"]; label: string; aggregate: MonteCarloAggregate }[];
}

export interface AISettings {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface RetirementTask {
  id: string;
  title: string;
  category: "finance" | "protection" | "housing" | "work" | "family";
  status: "todo" | "doing" | "done" | "not-applicable";
  dueMonth?: YearMonth;
  note: string;
  custom: boolean;
}

export interface AppData {
  household: HouseholdSnapshot;
  scenarios: ScenarioSnapshot[];
  conversations: ConversationMessage[];
  aiSettings: AISettings;
  riskSettings: RiskModelSettings;
  monteCarloRuns: MonteCarloSnapshot[];
  stressTestRuns: StressTestSnapshot[];
  withdrawalRuns: WithdrawalComparisonSnapshot[];
  retirementTasks: RetirementTask[];
}

export interface ProposedParameterChange {
  id: string;
  status: "pending" | "accepted" | "rejected";
  changes: { path: string; before: number | string; after: number | string }[];
}
