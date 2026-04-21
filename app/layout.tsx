import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Éclat | 顧客管理アプリ",
  description: "洗練された営業アプローチを。スマートな顧客管理ツール。",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512.svg",
    apple: "/icon-512.svg",
  },
  themeColor: "#E8789A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="w-full min-h-screen relative overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
