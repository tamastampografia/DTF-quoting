import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STAMPOO — Preventivo DTF online",
  description: "Calcola il preventivo per i tuoi transfer DTF con STAMPOO by TAMAS SRL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
