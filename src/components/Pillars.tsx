import Container from "@/components/Container";

const pillars = [
  {
    title: "Clareza",
    desc: "Mensagem objetiva e posicionamento que diferencia.",
    delivery: "Mapa de mensagem",
  },
  {
    title: "Conversão",
    desc: "Jornada que transforma interesse em oportunidade real.",
    delivery: "CTA alinhado ao fluxo",
  },
  {
    title: "Consistência",
    desc: "Processo contínuo para crescer com previsibilidade.",
    delivery: "Rotina editorial",
  },
];

export default function Pillars() {
  return (
    <section id="pilares" className="scroll-mt-24 pt-2 pb-20">
      <Container>
        <div className="mb-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-re7-gray/70">
            Pilares
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            Base sólida para uma presença digital profissional.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/10 md:p-7"
            >
              <h3 className="text-lg font-semibold text-white">
                {pillar.title}
              </h3>
              <p className="mt-2 text-sm text-re7-gray/85">{pillar.desc}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.25em] text-re7-sky/80">
                {pillar.delivery}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
