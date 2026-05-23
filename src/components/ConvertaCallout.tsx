import Container from "@/components/Container";
import Button from "@/components/Button";

export default function ConvertaCallout() {
  return (
    <section className="py-6 md:py-8">
      <Container>
        <div className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/10 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-re7-gray/70">
              Produto RE7ONLINE
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white text-balance md:text-3xl">
              Conheça o Converta, nossa central inteligente de atendimento e vendas.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-re7-gray/85">
              WhatsApp, Instagram e Facebook/Messenger em um inbox operacional com CRM conversacional,
              automação, IA supervisionada e atendimento humano.
            </p>
          </div>

          <Button href="/converta" variant="primary" className="w-full md:w-auto">
            Ver o Converta
          </Button>
        </div>
      </Container>
    </section>
  );
}
