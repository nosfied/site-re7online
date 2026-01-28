import Container from "@/components/Container";

const services = [
  {
    title: "Site / Landing Page",
    desc: "Página clara e focada em conversão com mensagem estratégica.",
    items: ["Arquitetura da informação", "Copy orientada a leads", "Integração com WhatsApp"],
  },
  {
    title: "Tráfego e campanhas",
    desc: "Aquisição de demanda com foco em leads qualificados.",
    items: ["Google e Meta Ads", "Segmentação eficiente", "Relatórios objetivos"],
  },
  {
    title: "Conteúdo e rotina",
    desc: "Presença consistente com temas, formatos e calendário.",
    items: ["Plano editorial", "Direção criativa", "Publicação recorrente"],
  },
  {
    title: "Automação e WhatsApp",
    desc: "Fluxos simples para acelerar o atendimento e a venda.",
    items: ["Scripts e mensagens", "Organização de contatos", "Follow-up rápido"],
  },
];

export default function Services() {
  return (
    <section id="servicos" className="scroll-mt-24 py-16">
      <Container>
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-re7-gray/70">
              Serviços
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              Entregas essenciais para posicionar, atrair e converter.
            </h2>
          </div>
          <p className="max-w-xl text-sm text-re7-gray/85">
            Um conjunto enxuto e completo para alinhar mensagem, canais e performance sem ruído.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.title}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 via-white/3 to-transparent p-6"
            >
              <h3 className="text-lg font-semibold text-white">{service.title}</h3>
              <p className="mt-3 text-sm text-re7-gray/85">{service.desc}</p>
              <ul className="mt-4 space-y-2 text-sm text-re7-gray/80">
                {service.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-re7-sky" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
