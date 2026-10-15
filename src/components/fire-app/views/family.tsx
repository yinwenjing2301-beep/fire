"use client";

import { CircleCheck, Plus, Trash2 } from "lucide-react";
import type { HouseholdSnapshot } from "@/types/finance";
import { Field, PageIntro, Panel, categoryName, clone, money } from "../ui";
export function Family({ household, change }: { household: HouseholdSnapshot; change: (next: HouseholdSnapshot) => void }) {
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