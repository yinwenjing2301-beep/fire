import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIRE 40｜家庭半退休规划",
  description: "看清家庭资产、住房与半退休计划的长期变化。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
