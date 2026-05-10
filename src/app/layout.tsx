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
  } catch (error) {
    document.documentElement.dataset.themePreference = "dark";
    document.documentElement.dataset.theme = "dark";
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
