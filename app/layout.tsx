import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "南堂花茶｜DFI 分店補貨",
  description: "記錄 Market Place、3hreesixty 及 Wellcome Fresh 分店的南堂花茶補貨與出貨趨勢。",
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
