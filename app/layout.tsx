import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { AudioEngine } from "@/components/player/audio-engine";
import { uiCssVars } from "@/lib/ui-config";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jelly Shark",
  description: "A custom Jellyfin frontend",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${dmSans.variable} h-full antialiased`}
      style={uiCssVars}
    >
      <body className="min-h-full bg-bg text-text">
        <Providers>
          {children}
          {/* Persistent music engine: survives navigation between every route. */}
          <AudioEngine />
        </Providers>
      </body>
    </html>
  );
}
