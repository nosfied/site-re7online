import Script from "next/script";

const siteId = process.env.NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID?.trim();
const apiBase = process.env.NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL?.trim() || "/agent-api";

export default function ConvertaWebchatEmbed() {
  if (!siteId) return null;

  return (
    <Script
      id="converta-webchat-widget"
      src="/webchat/widget.js?v=67b1"
      strategy="afterInteractive"
      data-site-id={siteId}
      data-api-base={apiBase}
      data-title="Converta"
      data-subtitle="Atendimento Re7online"
      data-welcome="Ola! Sou o assistente da Re7online. Posso te ajudar com o Converta, demonstracao, suporte ou informacoes para orgaos publicos."
      data-accent="#fc6c16"
      data-bottom="96px"
      data-bottom-mobile="84px"
    />
  );
}
