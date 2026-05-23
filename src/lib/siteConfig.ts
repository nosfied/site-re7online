export const siteConfig = {
  companyName: "Re7Online",
  productName: "Converta",
  whatsappNumber: "558494312982",
  whatsappDisplay: "(84) 9431-2982",
  demoMessage:
    "Ola! Quero conhecer o CONVERTA e solicitar uma demonstracao da central inteligente de atendimento.",
};

export function buildWhatsAppUrl(message = siteConfig.demoMessage) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
