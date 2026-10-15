import type { AppData, HouseholdSnapshot, RetirementTask } from "@/types/finance";

export const defaultRetirementTasks: RetirementTask[] = [
  { id: "task-fire-assets", title: "确认目标可投资资产与实际缺口", category: "finance", status: "todo", note: "", custom: false },
  { id: "task-cash-buffer", title: "确定退休现金缓冲月数", category: "finance", status: "todo", note: "", custom: false },
  { id: "task-stress", title: "完成退休初期暴跌与失业压力测试", category: "finance", status: "todo", note: "", custom: false },
  { id: "task-medical", title: "确认退出全职后的医保衔接方式", category: "protection", status: "todo", note: "", custom: false },
  { id: "task-pension", title: "核实夫妻社保缴费年限与养老金假设", category: "protection", status: "todo", note: "", custom: false },
  { id: "task-insurance", title: "确认商业保险保障范围与续保条件", category: "protection", status: "todo", note: "", custom: false },
  { id: "task-housing", title: "核实昆明购房、贷款和装修预算", category: "housing", status: "todo", note: "", custom: false },
  { id: "task-move", title: "规划迁居时间与搬家成本", category: "housing", status: "todo", note: "", custom: false },
  { id: "task-light-work", title: "验证夫妻轻工作收入来源", category: "work", status: "todo", note: "", custom: false },
  { id: "task-no-income", title: "准备无劳动收入过渡方案", category: "work", status: "todo", note: "", custom: false },
  { id: "task-education", title: "补充孩子各教育阶段费用", category: "family", status: "todo", note: "", custom: false },
  { id: "task-eldercare", title: "与家庭确认双方父母养老安排", category: "family", status: "todo", note: "", custom: false }
];

export const defaultHousehold: HouseholdSnapshot = {
  version: 1,
  presetRevision: 4,
  householdName: "我们的 FIRE 40 计划",
  baseMonth: "2026-10",
  currency: "CNY",
  members: [
    { id: "male", name: "男方", role: "伴侣", age: 34, occupation: "程序员", monthlyIncome: 16000, providentContribution: 6000, retirementAge: 40 },
    { id: "female", name: "女方", role: "伴侣", age: 35, occupation: "产品经理", monthlyIncome: 27000, providentContribution: 1200, retirementAge: 40 },
    { id: "child", name: "孩子", role: "子女", age: 3, occupation: "幼儿园", monthlyIncome: 0, providentContribution: 0, retirementAge: null }
  ],
  accounts: [
    { id: "a-stock", name: "A 股账户", category: "stock", balance: 470000, currency: "CNY", liquid: true, retirementUsable: true },
    { id: "global-a", name: "美股及港股账户 A", category: "stock", balance: 620000, currency: "CNY", liquid: true, retirementUsable: true },
    { id: "global-b", name: "美股账户 B", category: "stock", balance: 160000, currency: "CNY", liquid: true, retirementUsable: true },
    { id: "alipay", name: "支付宝账户", category: "cash", balance: 245000, currency: "CNY", liquid: true, retirementUsable: true },
    { id: "bank", name: "银行活期", category: "cash", balance: 318000, currency: "CNY", liquid: true, retirementUsable: true },
    { id: "insurance", name: "分红储蓄险", category: "insurance", balance: 0, currency: "CNY", liquid: false, retirementUsable: false, note: "已缴保费 30 万，现金价值待补充" },
    { id: "provident", name: "男方公积金", category: "provident", balance: 400000, currency: "CNY", liquid: false, retirementUsable: true },
    { id: "home-f", name: "女方老家房产", category: "property", balance: 100000, currency: "CNY", liquid: false, retirementUsable: false },
    { id: "home-m", name: "男方老家房产", category: "property", balance: 500000, currency: "CNY", liquid: false, retirementUsable: false }
  ],
  expenses: [
    { id: "rent", name: "房租", monthlyAmount: 5000, inflationRate: 0.02 },
    { id: "utilities", name: "水电燃气", monthlyAmount: 300, inflationRate: 0.02 },
    { id: "living", name: "生活费", monthlyAmount: 5000, inflationRate: 0.02 },
    { id: "eldercare", name: "双方父母养老支出", monthlyAmount: 5000, inflationRate: 0.02 },
    { id: "kindergarten", name: "幼儿园", monthlyAmount: 1800, inflationRate: 0.02 },
    { id: "other", name: "其他", monthlyAmount: 2000, inflationRate: 0.02 }
  ],
  lifecycle: [
    { id: "edu-kindergarten", name: "幼儿园阶段", category: "education", memberId: "child", sourceExpenseId: "kindergarten", startMonth: "2026-10", endMonth: "2029-08", monthlyAmount: 1800, annualAmount: null, oneTimeAmount: null, inflationRate: 0.02, mode: "included", essential: true },
    { id: "edu-primary", name: "小学阶段", category: "education", memberId: "child", startMonth: "2029-09", endMonth: "2035-08", monthlyAmount: null, annualAmount: null, oneTimeAmount: null, inflationRate: 0.03, mode: "additional", essential: true },
    { id: "edu-junior", name: "初中阶段", category: "education", memberId: "child", startMonth: "2035-09", endMonth: "2038-08", monthlyAmount: null, annualAmount: null, oneTimeAmount: null, inflationRate: 0.03, mode: "additional", essential: true },
    { id: "edu-senior", name: "高中阶段", category: "education", memberId: "child", startMonth: "2038-09", endMonth: "2041-08", monthlyAmount: null, annualAmount: null, oneTimeAmount: null, inflationRate: 0.03, mode: "additional", essential: true },
    { id: "edu-university", name: "大学阶段", category: "education", memberId: "child", startMonth: "2041-09", endMonth: "2045-08", monthlyAmount: null, annualAmount: null, oneTimeAmount: null, inflationRate: 0.03, mode: "additional", essential: true },
    { id: "eldercare-current", name: "双方父母当前养老支出", category: "eldercare", sourceExpenseId: "eldercare", startMonth: "2026-10", monthlyAmount: 5000, annualAmount: null, oneTimeAmount: null, inflationRate: 0.02, mode: "included", essential: true }
  ],
  socialSecurity: [
    { memberId: "male", currentRegion: "北京", paidYears: null, continueContributions: false, futureRegion: "待确认", monthlyContribution: null, medicalCoverage: "unknown", annualCommercialPremium: null, pensionStartAge: null, estimatedMonthlyPension: null, pensionConfirmed: false, note: "待补充社保、医保及养老金信息" },
    { memberId: "female", currentRegion: "北京", paidYears: null, continueContributions: false, futureRegion: "待确认", monthlyContribution: null, medicalCoverage: "unknown", annualCommercialPremium: null, pensionStartAge: null, estimatedMonthlyPension: null, pensionConfirmed: false, note: "待补充社保、医保及养老金信息" }
  ],
  withdrawalStrategy: { type: "cash-buffer", annualRate: 0.03, necessaryMonthlyExpense: 8000, discretionaryMonthlyExpense: 2000, drawdownTrigger: 0.15, discretionaryReduction: 0.5, cashBufferMonths: 12 },
  housing: {
    enabled: true, city: "昆明", purchaseMonth: "2032-01", unitPrice: 11000, area: 100,
    downPayment: 250000, renovation: 200000, otherCosts: 50000,
    loanAnnualRate: 0.031, loanYears: 30, loanType: "equal-payment", providentWithdrawal: 400000
  },
  settings: {
    mode: "fixed", annualReturn: 0.05, transitionReturn: 0.04, retirementReturn: 0.035,
    inflationRate: 0.02, maleRetirementAge: 40, femaleRetirementAge: 40,
    maleLightIncome: 2000, femaleLightIncome: 2000, retirementMonthlyExpense: 10000,
    withdrawalRate: 0.03, cashBufferMonths: 12, endAge: 100
  },
  updatedAt: new Date().toISOString()
};

export const defaultAppData: AppData = {
  household: defaultHousehold,
  scenarios: [],
  conversations: [],
  aiSettings: { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
  riskSettings: { annualVolatility: 0.15, iterations: 10000, seed: 40202610, confirmed: false, endAge: 100 },
  monteCarloRuns: [],
  stressTestRuns: [],
  withdrawalRuns: [],
  retirementTasks: structuredClone(defaultRetirementTasks)
};
