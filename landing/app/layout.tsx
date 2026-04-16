import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";
import FloatingPixels from "../components/FloatingPixels";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pixel.team \u2014 Your AI agents deserve an office",
  description:
    "Watch your AI team build software in a virtual office. From idea to shipped product, with full visibility into every decision.",
  openGraph: {
    title: "pixel.team \u2014 Your AI agents deserve an office",
    description:
      "Watch your AI team build software in a virtual office. From idea to shipped product, with full visibility into every decision.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${pressStart2P.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-screen antialiased">
        <FloatingPixels />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
