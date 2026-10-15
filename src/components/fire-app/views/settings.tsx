"use client";

import { useRef, useState } from "react";
import { Cog, Download, Eye, EyeOff, Landmark, Upload, Zap } from "lucide-react";
import { downloadBackup, readBackup } from "@/lib/storage";
import type { AppData } from "@/types/finance";
import { AIConnection, PageIntro, Panel } from "../ui";
export function SettingsView({ data, update, aiConnection, setAIConnection }: { data: AppData; update: (next: AppData) => void; aiConnection: AIConnection; setAIConnection: (next: AIConnection) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [connection, setConnection] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const importFile = async (file?: File) => { if (!file) return; try { const next = await readBackup(file); update(next); setAIConnection({ ...next.aiSettings, apiKey: aiConnection.apiKey }); setConnection("备份已恢复，AI Key 仍使用本机设置"); } catch (error) { setConnection(error instanceof Error ? error.message : "恢复失败"); } };
  const set = (key: keyof AIConnection, value: string) => setAIConnection({ ...aiConnection, [key]: value });
  const test = async () => {
    setTesting(true); setConnection("");
    try {
      const response = await fetch("/api/ai/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiConnection) });
      const payload = await response.json(); setConnection(payload.ok ? `${payload.model} 连接成功` : payload.error);
    } catch { setConnection("连接失败，请检查地址和本地服务"); }
    finally { setTesting(false); }
  };
  return <>
    <PageIntro eyebrow="设置中心" title="把模型接进你的计划。" copy="模型地址、名称和 AI 对话会随家庭备份迁移；API Key 只保留在当前浏览器会话。"/>
    <section className="connection-card">
      <div className="connection-title"><span><Cog size={22}/></span><div><h2>接口提供商与连接凭证</h2><p>配置 AI 财务顾问使用的模型服务</p></div></div>
      <label className="credential-field required"><span>提供商类型</span><select value={aiConnection.provider} onChange={(event) => set("provider", event.target.value)}><option value="openai-compatible">OpenAI 兼容接口</option></select><small>支持 OpenAI 兼容协议的云端或内网模型服务。</small></label>
      <div className="credential-grid">
        <label className="credential-field required"><span>基础请求接口（Base URL）</span><input value={aiConnection.baseUrl} onChange={(event) => set("baseUrl", event.target.value)} placeholder="https://api.openai.com/v1" autoComplete="url"/></label>
        <label className="credential-field required"><span>模型标识名称（Model Name）</span><input value={aiConnection.model} onChange={(event) => set("model", event.target.value)} placeholder="gpt-5-mini" autoComplete="off"/></label>
      </div>
      <label className="credential-field"><span>身份鉴权 Key（API Key）</span><div className="secret-input"><input type={showKey ? "text" : "password"} value={aiConnection.apiKey} onChange={(event) => set("apiKey", event.target.value)} placeholder="未启用鉴权时可留空" autoComplete="off"/><button type="button" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>
      <div className="connection-actions"><button className="secondary test-button" disabled={testing || !aiConnection.baseUrl || !aiConnection.model} onClick={() => void test()}><Zap size={17}/>{testing ? "正在测试…" : "测试模型连通性"}</button>{connection && <p className={connection.includes("成功") ? "connection success" : "connection error"}>{connection}</p>}</div>
      <p className="credential-note">未启用鉴权时可留空。内网 HTTP 地址仅适合本机或受信网络部署。</p>
    </section>
    <div className="split-grid"><Panel title="数据管理" eyebrow="IndexedDB 本地存储"><div className="settings-actions"><button className="primary" onClick={() => downloadBackup(data)}><Download size={17}/> 导出完整 JSON 备份</button><button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={17}/> 导入备份</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => void importFile(event.target.files?.[0])}/></div><div className="privacy-note"><Landmark/><div><strong>备份包含得更完整</strong><p>家庭资料、生命周期、社保养老金、提取策略、准备任务、风险结果和 AI 对话都会导出；原始随机路径和 API Key 不会导出。</p></div></div></Panel><Panel title="隐私与安全"><div className="setting-list"><div><span>风险结果保存</span><strong>聚合结果与种子</strong></div><div><span>原始 10,000 条路径</span><strong>不保存</strong></div><div><span>模型地址与名称</span><strong>随备份导出</strong></div><div><span>API Key</span><strong>仅当前浏览器会话</strong></div><div><span>AI 未确认自动修改</span><strong>禁止</strong></div></div></Panel></div>
  </>;
}