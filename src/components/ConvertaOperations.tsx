import Container from "@/components/Container";

const companyItems = [
  "Saber onde a empresa perde vendas",
  "Acompanhar atendimento por canal e operador",
  "Ver histórico, SLA e follow-up em um só lugar",
  "Reduzir dependência de conversas soltas no celular",
];

const agencyItems = [
  "Mostrar onde o lead morre depois do anúncio",
  "Provar que o problema não é sempre o tráfego",
  "Aumentar retenção com estrutura operacional",
  "Elevar ticket entregando gestão comercial real",
];

const authority = [
  "WhatsApp oficial",
  "IA supervisionada",
  "LGPD e dados redigidos",
  "Governança multitenant",
  "Operação em tempo real",
  "Histórico auditável",
];

export default function ConvertaOperations() {
  return (
    <section className="scroll-mt-24 py-8 md:py-12">
      <Container>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/10 md:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-re7-sky">Para empresários</p>
            <h2 className="mt-3 text-3xl font-semibold text-white text-balance md:text-4xl">
              Saiba exatamente onde sua empresa perde vendas.
            </h2>
            <p className="mt-4 text-base leading-7 text-re7-gray/85 md:text-lg">
              Acompanhe equipe, conversas, status e histórico para deixar de operar no escuro.
            </p>
            <ul className="mt-5 grid gap-3">
              {companyItems.map((item) => (
                <li key={item} className="flex gap-3 text-base leading-7 text-white/88">
                  <span className="mt-1 text-re7-amber">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-re7-sky/25 bg-re7-sky/10 p-5 shadow-xl shadow-black/10 md:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-re7-sky">Para agências</p>
            <h2 className="mt-3 text-3xl font-semibold text-white text-balance md:text-4xl">
              Pare de perder clientes porque o atendimento deles é desorganizado.
            </h2>
            <p className="mt-4 text-base leading-7 text-re7-gray/85 md:text-lg">
              Mostre onde o lead está morrendo e entregue uma operação comercial estruturada para aumentar
              conversão e retenção.
            </p>
            <ul className="mt-5 grid gap-3">
              {agencyItems.map((item) => (
                <li key={item} className="flex gap-3 text-base leading-7 text-white/88">
                  <span className="mt-1 text-re7-amber">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-[#081327]/80 p-5 md:p-7">
          <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-re7-gray/70">
                Autoridade operacional
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white text-balance md:text-4xl">
                Estrutura séria para atendimento, dados e crescimento.
              </h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {authority.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-base text-white">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
