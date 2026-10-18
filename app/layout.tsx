import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { AudioEngine } from "@/components/player/audio-engine";
import { uiCssVars } from "@/lib/ui-config";
import { UiPrefsApplier } from "@/components/ui-prefs-applier";
import { BrandApplier } from "@/components/brand-applier";
import { SettingsSync } from "@/components/settings-sync";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
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
      suppressHydrationWarning
    >
      <head>
        {/* Apply a cached custom accent before first paint (the real branding is fetched by <BrandApplier>). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var b=JSON.parse(localStorage.getItem("jelly-shark-brand"));if(b&&b.brand&&/^#[0-9a-f]{6}$/i.test(b.brand.accent)){var h=b.brand.accent,n=parseInt(h.slice(1),16),c=function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)},L=function(x){return .2126*c((x>>16)&255)+.7152*c((x>>8)&255)+.0722*c(x&255)},a=L(n),d=(a+.05)/(L(267803)+.05),w=1.05/(a+.05),s=document.documentElement.style;s.setProperty("--color-accent",h);s.setProperty("--color-on-accent",d>=w?"#04161b":"#ffffff")}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full bg-bg text-text">
        <Providers>
          {children}
          {/* Persistent music engine: survives navigation between every route. */}
          <AudioEngine />
          <UiPrefsApplier />
          <BrandApplier />
          <SettingsSync />
          <ShortcutsDialog />
        </Providers>
      </body>
    </html>
  );
}
