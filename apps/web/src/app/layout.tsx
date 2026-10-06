import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "OpenCharm: a face, a voice and one key for your AI agent";
const DESCRIPTION =
  "OpenCharm is an open-source body for the AI agent you already run (Claude Code, Codex, Hermes Agent, OpenClaw or any ACP agent): a face, a voice and one key. At the top of your Mac or Windows screen today, on a small board you build next.";

// Only Vercel builds count page views; local builds would ask for a script that isn't there.
const ANALYTICS = process.env.VERCEL === "1";

export const metadata: Metadata = {
  metadataBase: new URL("https://opencharm.dev"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "OpenCharm",
  keywords: [
    "OpenCharm",
    "AI agent",
    "AI companion",
    "desktop companion",
    "Mac notch",
    "Windows",
    "Claude Code",
    "Codex",
    "Hermes Agent",
    "OpenClaw",
    "Agent Client Protocol",
    "ACP",
    "ESP32-S3",
    "open-source hardware",
    "voice assistant",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "OpenCharm",
    locale: "en_GB",
    title: "OpenCharm: meet your agentic companion",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenCharm: meet your agentic companion",
    description: DESCRIPTION,
  },
};

// The browser's own bar takes the paper colour (Chrome on Android, Safari's tinted bar); light only,
// so the browser never recolours the page or its controls for dark mode.
export const viewport: Viewport = {
  themeColor: "#F6F6F4",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        {ANALYTICS ? <Analytics /> : null}
      </body>
    </html>
  );
}
