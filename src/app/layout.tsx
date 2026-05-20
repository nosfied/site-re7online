import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Re7Online | Comunicação, Marketing e Tecnologia",
  description:
    "Menos ruído. Mais resultados. Comunicação, marketing e tecnologia para negócios que querem crescer com estratégia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Converta",
  },
  icons: {
    icon: [{ url: "/re7-favicon.ico?v=re7", sizes: "64x62", type: "image/x-icon" }],
    shortcut: ["/re7-favicon.ico?v=re7"],
    apple: [{ url: "/converta-favicon.png?v=converta-dark", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06132a",
};

const themeBootstrapScript = `
(function () {
  try {
    var key = "converta-theme";
    var stored = window.localStorage.getItem(key);
    var preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
    var resolved = preference;
    if (preference === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    var standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true;
    var iosLike =
      /iPad|iPhone|iPod/i.test(window.navigator.userAgent || "") ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    document.documentElement.dataset.standalone = standalone ? "true" : "false";
    document.documentElement.dataset.iosLike = iosLike ? "true" : "false";
  } catch (error) {
    document.documentElement.dataset.themePreference = "dark";
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.standalone = "false";
    document.documentElement.dataset.iosLike = "false";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {children}
      </body>
    </html>
  );
}
