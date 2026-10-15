import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().optional().default("")
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "请填写有效的 Base URL 和模型名称" }, { status: 422 });
  try {
    const client = new OpenAI({ apiKey: parsed.data.apiKey || process.env.OPENAI_API_KEY || "not-required", baseURL: parsed.data.baseUrl });
    const response = await client.chat.completions.create({ model: parsed.data.model, messages: [{ role: "user", content: "只回复：连接成功" }], max_tokens: 20 });
    return NextResponse.json({ ok: true, model: parsed.data.model, response: response.choices[0]?.message.content });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "连接失败" }, { status: 502 });
  }
}
