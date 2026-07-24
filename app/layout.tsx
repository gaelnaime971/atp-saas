import type { Metadata } from "next";
import { Outfit, DM_Mono } from "next/font/google";
import "./globals.css";

// Poids alignés exactement sur l'ancien @import Google CSS pour ne rien
// changer visuellement. Le code appelle occasionnellement font-extrabold (800)
// et font-black (900) — comme avant, ces poids ne sont pas chargés et le
// navigateur synthétise depuis 700. Voir REFONTE.md pour l'action future.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ATP Coaching",
  description: "Plateforme de gestion et de suivi pour traders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
