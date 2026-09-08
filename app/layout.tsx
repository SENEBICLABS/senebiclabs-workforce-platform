import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import { AppStateProvider } from "@/components/AppState";
import "./globals.css";

/**
 * Three faces, each with one job.
 *
 * All are variable fonts, so no weight array is passed: the whole axis ships in
 * one file and any weight the design asks for is real rather than synthesised.
 */

/** Headings. Set tight and bold. */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

/** Eyebrows and anything that wants to read as a label rather than a sentence. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Body. Softer and rounder than the headings, which is the point of the pair. */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Senebiclabs",
  description: "Clinical review platform for licensed clinicians",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
