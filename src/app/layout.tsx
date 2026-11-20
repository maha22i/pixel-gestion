import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Pixel Nomade — Gestion",
  description: "Gestion financière Pixel Nomade : devis, factures, paiements, dépenses",
  applicationName: "Pixel Nomade",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pointer", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
