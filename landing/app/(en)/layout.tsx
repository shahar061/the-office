import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "../globals.css";
import FloatingPixels from "../../components/FloatingPixels";
import { getDictionary } from "@/lib/i18n/dictionaries";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary("en");
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: "website",
    },
  };
}

export default function EnglishRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${inter.variable} ${pressStart2P.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-screen antialiased">
        <FloatingPixels />
        <div className="relative z-10">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
