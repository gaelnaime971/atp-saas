import type { Metadata } from "next";
import { Outfit, DM_Mono } from "next/font/google";
import "./globals.css";

// Poids chargés : 300/400/500/600/700 + 800.
// Le 800 est ajouté car font-extrabold est utilisé 95 fois dans le code, notamment
// sur les gros chiffres de KPI. Sans le vrai poids, le navigateur synthétise depuis
// 700 et déforme les lettres — visible sur les valeurs monétaires. Le 900 (16 occ.)
// reste synthétique pour l'instant (statu quo).
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
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
