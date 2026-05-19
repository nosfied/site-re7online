import type { Metadata } from "next";
import AppRealtimeBridge from "@/components/app/AppRealtimeBridge";

export const metadata: Metadata = {
  title: {
    default: "Converta",
    template: "%s | Converta",
  },
  description: "Converta — atendimento inteligente via WhatsApp com automacao, campanhas e gestao de leads.",
  applicationName: "Converta",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Converta",
  },
  icons: {
    icon: [{ url: "/converta-favicon.png?v=converta-dark", type: "image/png" }],
    shortcut: ["/converta-favicon.png?v=converta-dark"],
    apple: [{ url: "/converta-favicon.png?v=converta-dark", type: "image/png" }],
  },
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <AppRealtimeBridge />
      {children}
    </>
  );
}
