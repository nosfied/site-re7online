import Container from "@/components/Container";
import Button from "@/components/Button";
import { buildWhatsAppUrl } from "@/lib/siteConfig";

const plans = [
  {
    name: "Essencial",
    price: "R$ 497/mês",
    desc: "Para iniciar atendimento organizado com canais oficiais.",
    features: ["WhatsApp oficial", "Inbox operacional", "CRM conversacional básico", "Suporte de implantação"],
  },
  {
    name: "Profissional",
    price: "R$ 1.197/mês",
    desc: "Para times que precisam de automação, IA supervisionada e gestão comercial.",
    featured: true,
    features: ["WhatsApp + Instagram + Messenger", "IA supervisionada", "Campanhas e follow-up", "Relatórios e SLA"],
  },
  {
    name: "Avançado",
    price: "Sob consulta",
    desc: "Para operações multitenant, franquias ou projetos com integrações específicas.",
    features: ["Ambiente multitenant", "Regras avançadas", "Integrações sob medida", "Acompanhamento consultivo"],
  },
];

export default function Plans() {
  return (
    <section id="planos" className="scroll-mt-24 py-10 md:py-16">
      <Container>
        <div className="mb-8 max-w-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-re7-gray/70">Planos</p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            Escolha o nível de operação para o seu momento.
          </h2>
          <p className="mt-4 text-base leading-7 text-re7-gray/85 md:text-lg">
            Valores estruturados para facilitar a decisão comercial. Os planos podem ser ajustados
            conforme canais, volume e necessidade de implantação.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-3xl border p-5 shadow-xl shadow-black/10 md:p-6 ${
                plan.featured
                  ? "border-re7-orange/55 bg-re7-orange/10"
                  : "border-white/10 bg-white/[0.045]"
              }`}
            >
              <p className="text-base font-semibold text-white">{plan.name}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{plan.price}</p>
              <p className="mt-3 min-h-12 text-base leading-7 text-re7-gray/82">{plan.desc}</p>
              <ul className="mt-5 space-y-3 text-base text-re7-gray/86">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-1 text-re7-amber">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                href={buildWhatsAppUrl(`Ola! Quero saber mais sobre o plano ${plan.name} do CONVERTA.`)}
                variant={plan.featured ? "primary" : "secondary"}
                className="mt-6 w-full"
                target="_blank"
                rel="noreferrer"
              >
                Conversar sobre o plano
              </Button>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
