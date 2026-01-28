import Container from "./Container";

const pillars = [
  {
    title: "Clareza",
    desc: "Mensagem direta e oferta objetiva para o cliente entender em segundos.",
  },
  {
    title: "Conversão",
    desc: "CTAs e fluxo pensados para levar o cliente ao WhatsApp/formulário.",
  },
  {
    title: "Consistência",
    desc: "Rotina de conteúdo + campanhas para gerar previsibilidade.",
  },
];

export default function ValuePillars() {
  return (
    <section className="py-12 md:py-16">
      <Container>
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition hover:bg-white/7"
            >
              <p className="text-sm font-semibold text-white">{p.title}</p>
              <p className="mt-2 text-sm text-white/70">{p.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
