import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Converta",
    template: "%s | Converta",
  },
  description: "Converta — atendimento inteligente via WhatsApp com automacao, campanhas e gestao de leads.",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
