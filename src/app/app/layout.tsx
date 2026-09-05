import type { Metadata } from "next";
import AppRealtimeBridge from "@/components/app/AppRealtimeBridge";
import PwaInstallCoach from "@/components/app/PwaInstallCoach";

export const metadata: Metadata = {
  title: {
    default: "Converta",
    template: "%s | Converta",
  },
  description: "Converta — atendimento inteligente via WhatsApp com automação, campanhas e gestão de contatos.",
  applicationName: "Converta",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Converta",
  },
  icons: {
    icon: [{ url: "/images/cv-favicon.png", type: "image/png" }],
    shortcut: ["/images/cv-favicon.png"],
    apple: [{ url: "/images/cv-favicon.png", type: "image/png" }],
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
      <PwaInstallCoach />
      {children}
    </>
  );
}
