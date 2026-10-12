import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// IoG brand body face; headings use Optima (see --display in globals.css).
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "MeaningEngine · Institute on Generosity",
  description: "A guided reflection on what makes your giving meaningful, grounded in IoG's research.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
