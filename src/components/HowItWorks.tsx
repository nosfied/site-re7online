import Container from "@/components/Container";

const steps = [
  {
    title: "Diagnóstico",
    desc: "Entendemos o negócio, o público e os canais atuais.",
  },
  {
    title: "Plano enxuto",
    desc: "Definimos prioridades, mensagem e próximos passos.",
  },
  {
    title: "Execução e ajustes semanais",
    desc: "Rodamos, medimos e ajustamos para manter tração.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 py-10 md:py-16">
      <Container>
        <div className="mb-8 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-re7-gray/70">
            Como funciona
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            Processo simples, foco no que gera resultado.
          </h2>
        </div>

        <div className="relative grid gap-4 md:grid-cols-3">
          <div className="pointer-events-none absolute inset-x-10 top-8 hidden h-px bg-white/10 md:block" />
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-2xl border border-white/10 bg-white/5 p-5 md:p-6"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-re7-navy text-sm font-semibold text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-re7-gray/85">{step.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
