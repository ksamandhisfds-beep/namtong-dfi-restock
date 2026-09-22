import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "南堂 DFI 補貨系統 V1.1｜智能補貨及送貨單版",
  description: "按巡店週期、貨架餘量及歷史補貨量提供建議，並可輸出分店 Delivery Note PDF。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-HK">
      <body className="antialiased">{children}</body>
    </html>
  );
}
