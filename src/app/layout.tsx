import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Re7Online | Comunicação, Marketing e Tecnologia",
  description:
    "Menos ruído. Mais resultados. Comunicação, marketing e tecnologia para negócios que querem crescer com estratégia.",
  icons: {
    icon: [{ url: "/re7-favicon.ico?v=re7", sizes: "64x62", type: "image/x-icon" }],
    shortcut: ["/re7-favicon.ico?v=re7"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
