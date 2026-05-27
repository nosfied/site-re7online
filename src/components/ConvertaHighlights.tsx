import Container from "@/components/Container";

const highlights = [
  "WhatsApp oficial",
  "Instagram + Messenger integrados",
  "Inbox unificado",
  "IA supervisionada",
  "Atendimento humano integrado",
  "CRM conversacional",
  "Follow-up automático",
  "Campanhas oficiais",
  "Aplicativo mobile",
  "SLA e relatórios",
  "Multitenant",
  "Segurança/LGPD",
];

export default function ConvertaHighlights() {
  return (
    <section id="converta" className="scroll-mt-24 py-8 md:py-12">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-re7-gray/70">Motor de conversão</p>
            <h2 className="mt-3 text-2xl font-semibold text-white text-balance md:text-4xl">
              CONVERTA é controle comercial aplicado ao atendimento do dia a dia.
            </h2>
            <p className="mt-4 text-base leading-7 text-re7-gray/85 md:text-lg">
              A plataforma organiza canais, atendimento humano, CRM, automação e IA supervisionada para
              revelar gargalos, acelerar resposta e impedir que oportunidades desapareçam sem acompanhamento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3.5 py-3 text-base text-white shadow-lg shadow-black/5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-re7-orange text-xs font-bold text-white">
                  ✓
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
