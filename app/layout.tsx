import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Document Intake Assistant",
  description:
    "A conversational interview that builds a fictional Personal Wishes Document. WenUp engineering technical test by Parthiv Abhani.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
