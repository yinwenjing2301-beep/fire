"use client";

import { useState } from "react";
import { ListChecks, Play, Sparkles, Trash2 } from "lucide-react";
import type { AppData } from "@/types/finance";
import { AIConnection, PageIntro } from "../ui";
export function Advisor({ data, update, aiConnection }: { data: AppData; update: (next: AppData) => void; aiConnection: AIConnection }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (preset?: string) => {
    const content = (preset ?? message).trim(); if (!content || busy) return;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, content, createdAt: new Date().toISOString() };
    const pending = { ...data, conversations: [...data.conversations, userMessage] }; update(pending); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, household: data.household, currentRiskSettings: data.riskSettings, riskResult: data.monteCarloRuns?.[0] ?? null, stressResult: data.stressTestRuns?.[0] ?? null, history: data.conversations.slice(-12), connection: aiConnection }) });
      const payload = await response.json();
      const assistant = { id: crypto.randomUUID(), role: "assistant" as const, content: payload.answer ?? payload.error ?? "AI 暂时无法回答", createdAt: new Date().toISOString() };
      update({ ...pending, conversations: [...pending.conversations, assistant] });
    } catch { update({ ...pending, conversations: [...pending.conversations, { id: crypto.randomUUID(), role: "assistant", content: "连接失败，请检查本地服务与网络。", createdAt: new Date().toISOString() }] }); }
    finally { setBusy(false); }
  };
  const clearConversation = () => { if (data.conversations.length > 0 && window.confirm("清空全部 AI 对话记录？家庭数据不会受影响。")) update({ ...data, conversations: [] }); };
  const saveAdvice = (content: string) => update({ ...data, retirementTasks: [...(data.retirementTasks ?? []), { id: crypto.randomUUID(), title: `跟进 AI 建议：${content.split("\n")[0].slice(0, 32)}`, category: "finance", status: "todo", note: content, custom: true }] });
  return <><PageIntro eyebrow="AI 财务顾问" title="让数字说人话，也让建议有依据。" copy="AI 会结合当前方案、风险模拟、压力测试和最近对话继续追问；没有底层结果时不会编造概率。"/><div className="chat-shell"><div className="chat-tools"><span>{data.conversations.length} 条本地对话 · 随家庭备份导出</span><button className="icon-text" onClick={clearConversation} disabled={data.conversations.length === 0 || busy}><Trash2 size={15}/> 清空对话</button></div><div className="chat-history">{data.conversations.length === 0 ? <div className="ai-welcome"><div className="spark"><Sparkles/></div><h2>今天想推演哪个人生选择？</h2><p>每个回答都会注明真实数据、模型假设、计算结果与判断。</p><div className="prompts"><button onClick={() => ask("根据最新长期风险模拟，我 40 岁半退休最大的三个风险是什么？")}>诊断长期退休风险</button><button onClick={() => ask("解释最新压力测试中最容易出现资金问题的阶段，以及三个改善方案的代价。")}>解释压力测试结果</button><button onClick={() => ask("比较 40 岁和延后两年退休的财务改善与时间代价。")}>40 岁还是 42 岁？</button><button onClick={() => ask("如果男方 38 岁被裁员，女方继续工作到 40 岁，我们还能在昆明半退休吗？")}>38 岁遭遇裁员会怎样？</button><button onClick={() => ask("从当前方案看，最值得优先补充或确认的三项数据是什么？")}>还有哪些数据没补全？</button><button onClick={() => ask("请检查当前家庭现金缓冲是否合理，并说明依据。")}>现金缓冲够不够？</button></div></div> : data.conversations.map((item) => <div className={`message ${item.role}`} key={item.id}><span>{item.role === "user" ? "你" : <Sparkles size={16}/>}</span><div><div>{item.content}</div>{item.role === "assistant" && <button className="advice-task" onClick={() => saveAdvice(item.content)}><ListChecks size={14}/> 转为准备任务</button>}</div></div>)}{busy && <div className="message assistant"><span><Sparkles size={16}/></span><div className="typing"><i/><i/><i/></div></div>}</div><div className="composer"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：最新风险模拟中，最值得优先处理的问题是什么？" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}/><button className="primary" onClick={() => void ask()} disabled={busy}><Play size={17}/> 分析</button></div></div></>;
}