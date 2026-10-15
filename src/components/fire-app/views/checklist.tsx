"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AppData, RetirementTask } from "@/types/finance";
import { PageIntro, Panel } from "../ui";
export const taskCategoryNames: Record<RetirementTask["category"], string> = { finance: "财务准备", protection: "保险与养老", housing: "居住准备", work: "工作准备", family: "家庭生活" };
export const taskStatusNames: Record<RetirementTask["status"], string> = { todo: "未开始", doing: "进行中", done: "已完成", "not-applicable": "暂不适用" };

export function RetirementChecklist({ data, update }: { data: AppData; update: (next: AppData) => void }) {
  const [title, setTitle] = useState("");
  const tasks = data.retirementTasks ?? [];
  const updateTask = (id: string, values: Partial<RetirementTask>) => update({ ...data, retirementTasks: tasks.map((task) => task.id === id ? { ...task, ...values } : task) });
  const addTask = () => { if (!title.trim()) return; update({ ...data, retirementTasks: [...tasks, { id: crypto.randomUUID(), title: title.trim(), category: "finance", status: "todo", note: "", custom: true }] }); setTitle(""); };
  const remaining = tasks.filter((task) => task.status !== "done" && task.status !== "not-applicable");
  const male = data.household.members.find((member) => member.id === "male");
  const female = data.household.members.find((member) => member.id === "female");
  const years = Math.max(data.household.settings.maleRetirementAge - (male?.age ?? data.household.settings.maleRetirementAge), data.household.settings.femaleRetirementAge - (female?.age ?? data.household.settings.femaleRetirementAge));
  return <><PageIntro eyebrow="退休前准备清单" title={`距离计划半退休约 ${Math.max(0, years)} 年，还有 ${remaining.length} 项待推进。`} copy="清单帮助落实行动，但勾选完成不代表财务风险自动消失；关键数字仍以模拟和实际核实结果为准。"/><Panel title="添加自定义任务"><div className="task-composer"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：咨询昆明灵活就业医保" onKeyDown={(event) => { if (event.key === "Enter") addTask(); }}/><button className="primary" onClick={addTask}><Plus size={16}/> 添加</button></div></Panel><div className="checklist-groups">{Object.entries(taskCategoryNames).map(([category,label]) => { const items = tasks.filter((task) => task.category === category); if (!items.length) return null; return <Panel title={label} eyebrow={`${items.filter((task) => task.status === "done").length}/${items.length} 已完成`} key={category}><div className="task-list">{items.map((task) => <article className={`task-item ${task.status}`} key={task.id}><div className="task-main"><select aria-label="任务状态" value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as RetirementTask["status"] })}>{Object.entries(taskStatusNames).map(([value,name]) => <option value={value} key={value}>{name}</option>)}</select><div><strong>{task.title}</strong><label><span>计划完成</span><input type="month" value={task.dueMonth ?? ""} onChange={(event) => updateTask(task.id, { dueMonth: (event.target.value || undefined) as typeof task.dueMonth })}/></label></div>{task.custom && <button className="icon-btn" aria-label="删除任务" onClick={() => update({ ...data, retirementTasks: tasks.filter((item) => item.id !== task.id) })}><Trash2 size={15}/></button>}</div><textarea aria-label="任务备注" value={task.note} placeholder="补充前提、结论或下一步…" onChange={(event) => updateTask(task.id, { note: event.target.value })}/></article>)}</div></Panel>; })}</div></>;
}