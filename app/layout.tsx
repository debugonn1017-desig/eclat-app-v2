import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Éclat | 顧客管理アプリ",
  description: "洗練された営業アプローチを。スマートな顧客管理ツール。",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512.svg",
    apple: "/icon-512.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#E8879A",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {/* 通常のブラウザでは縦スクロールをドキュメントに任せる。 */}
        <main id="eclat-app-content" data-customer-scroll="app-content" className="w-full min-h-screen relative overflow-x-clip">
          {children}
        </main>
        <div id="eclat-bottom-nav-slot" />
      </body>
    </html>
  );
}
