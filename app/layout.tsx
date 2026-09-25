import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Document Intake Assistant",
  description:
    "A conversational interview that builds a fictional Personal Wishes Document. Wenup engineering technical test by Parthiv Abhani.",
  // A test submission, not a product: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} antialiased`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
