import Container from "@/components/Container";

const audiences = [
  {
    audience: "Empresário / gestor",
    pain: "Minha empresa cresce, mas eu não tenho controle.",
    description:
      "Para quem precisa parar de perder clientes, depender menos de pessoas específicas e enxergar onde o comercial está travando.",
    points: ["controle do atendimento", "visão do comercial", "previsibilidade", "gestão por dados"],
  },
  {
    audience: "Gestor de tráfego / agência",
    pain: "Eu gero resultado, mas meu cliente não consegue converter.",
    description:
      "Para quem entrega leads, mas vê o resultado morrer por atraso no atendimento, falta de follow-up e ausência de processo comercial.",
    points: ["lead acompanhado", "SLA visível", "follow-up rastreável", "prova operacional"],
  },
  {
    audience: "Agência / consultoria / prestador",
    pain: "Meu cliente acha que marketing sozinho resolve.",
    description:
      "Para quem quer aumentar ticket, melhorar retenção e virar parceiro estratégico entregando estrutura de atendimento e vendas.",
    points: ["mais valor percebido", "retenção", "operação estruturada", "parceria contínua"],
  },
];

export default function ConvertaAudiences() {
  return (
    <section className="scroll-mt-24 py-8 md:py-12">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-re7-gray/70">Diagnóstico comercial</p>
            <h2 className="mt-3 text-2xl font-semibold text-white text-balance md:text-4xl">
              Cada público chega por uma dor diferente. Todas passam pelo mesmo ponto: operação sem controle.
            </h2>
            <p className="mt-4 text-base leading-7 text-re7-gray/85 md:text-lg">
              O Converta não começa pela ferramenta. Ele começa mostrando o que está invisível: demora,
              abandono, falta de dono, baixa previsibilidade e dinheiro vazando entre uma conversa e outra.
            </p>
            <div className="mt-5 rounded-3xl border border-re7-orange/30 bg-re7-orange/10 p-4 text-base leading-7 text-white/88 md:p-5">
              <p className="font-semibold text-white">O grande insight</p>
              <p className="mt-2">
                Quando o atendimento fica visível, o gestor descobre quem vende, quem enrola, quais leads
                esfriam e onde a receita deixa de acontecer.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {audiences.map((item) => (
              <article
                key={item.audience}
                className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/10 md:p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-re7-sky">
                      {item.audience}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white text-balance">"{item.pain}"</h3>
                    <p className="mt-3 text-base leading-7 text-re7-gray/82">{item.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.points.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#081327]/70 px-3 py-1.5 text-sm text-re7-gray/86"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                      {point}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
