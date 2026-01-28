import Image from "next/image";
import Container from "@/components/Container";
import Button from "@/components/Button";

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-12 sm:pt-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-10 h-72 w-72 rounded-full bg-re7-sky/20 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-re7-orange/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(127,196,229,0.18),transparent_55%)]" />
        <div className="absolute left-1/2 top-[-28%] hidden h-[640px] w-[640px] -translate-x-1/2 md:block lg:h-[760px] lg:w-[760px]">
          <Image
            src="/brand/re7-logo.png"
            alt=""
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      <Container className="relative pb-10 pt-10 md:pb-16 md:pt-12">
        <div className="w-full max-w-5xl">
          <div className="hidden md:block h-64" />

          <div className="md:flex md:flex-col">
            <p className="text-[11px] uppercase tracking-[0.4em] text-re7-gray/70">
              Comunicação • Marketing • Tecnologia
            </p>

            <p className="mt-4 text-base text-re7-gray/90 md:text-lg text-balance max-w-xl">
              Comunicação, marketing e tecnologia para negócios que querem crescer
              com estratégia.
            </p>
          </div>

          <div className="mt-10 md:mt-14 md:flex md:items-center md:justify-between md:gap-6">
            <div className="flex flex-wrap gap-4 text-sm text-re7-gray/85">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                Oferta clara
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                Página que converte
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                Rotina + campanhas
              </span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 sm:justify-end md:mt-0 md:justify-end">
              <Button href="#diagnostico" variant="primary" className="w-full sm:w-auto">
                Solicitar diagnóstico
              </Button>
              <Button href="#como-funciona" variant="secondary" className="w-full sm:w-auto">
                Ver como funciona
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
