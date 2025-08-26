import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";


const inter = Inter({ subsets: ["latin"] });


export const metadata: Metadata = {
title: "Sopranos Flop Helper — Call or Fold?",
description: "Beginner-friendly Texas Hold’em flop analyzer with Sopranos vibes — pick Call or Fold and get an instant verdict.",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
<html lang="en" className="h-full">
<body className={`${inter.className} h-full bg-black text-slate-100 antialiased`}>{children}</body>
</html>
);
}
