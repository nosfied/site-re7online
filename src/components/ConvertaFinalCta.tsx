import Button from "@/components/Button";
import Container from "@/components/Container";
import { buildWhatsAppUrl } from "@/lib/siteConfig";

export default function ConvertaFinalCta() {
  return (
    <section className="py-10 md:py-16">
      <Container>
        <div className="rounded-[2rem] border border-re7-orange/35 bg-[linear-gradient(135deg,rgba(252,108,22,0.18),rgba(127,196,229,0.12))] p-6 text-center shadow-2xl shadow-black/20 md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-re7-amber">Próximo passo</p>
          <h2 className="mx-auto mt-3 max-w-4xl text-3xl font-semibold text-white text-balance md:text-5xl">
            Você não precisa de mais leads. Precisa parar de perder os que já chegam.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-white/86 md:text-lg">
            Solicite uma demonstração e veja como organizar atendimento, equipe, canais e acompanhamento em
            uma central inteligente de operação comercial.
          </p>
          <div className="mt-6 grid gap-3 sm:flex sm:justify-center">
            <Button
              href={buildWhatsAppUrl("Ola! Quero organizar meu atendimento com o Converta.")}
              variant="primary"
              target="_blank"
              rel="noreferrer"
            >
              Quero organizar meu atendimento
            </Button>
            <Button
              href={buildWhatsAppUrl("Ola! Quero falar com um especialista sobre o Converta.")}
              variant="secondary"
              className="!border-re7-sky !bg-re7-sky !text-re7-navy hover:!bg-re7-sky/90"
              target="_blank"
              rel="noreferrer"
            >
              Falar com especialista
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
