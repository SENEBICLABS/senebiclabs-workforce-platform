import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
import { AppStateProvider } from "@/components/AppState";
import "./globals.css";

/**
 * Three faces, each with one job: a heavy geometric display face for headings
 * and a plain humanist sans for reading.
 */

/** Headings and eyebrows. */
const display = Montserrat({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
});

/** Body. Every sentence on the platform. */
const body = IBM_Plex_Sans({
  variable: "--font-body-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Case ids and key caps: anything that is a code rather than a word. */
const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
