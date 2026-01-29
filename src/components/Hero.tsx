import Image from "next/image";
import Container from "@/components/Container";
import Button from "@/components/Button";
import LogoCycle from "@/components/LogoCycle";

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-12 sm:pt-16">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/brand/re7-office.jpeg"
          alt=""
          fill
          className="object-cover object-right"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-re7-navy/95 via-re7-navy/80 to-re7-navy/40" />
        <div className="absolute -left-40 top-10 h-72 w-72 rounded-full bg-re7-sky/20 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-re7-orange/20 blur-3xl" />
        <LogoCycle
          className="absolute left-1/2 top-[-10%] h-[280px] w-[280px] -translate-x-1/2 opacity-45 sm:top-[-8%] sm:h-[340px] sm:w-[340px] sm:opacity-50 md:top-[-28%] md:h-[640px] md:w-[640px] md:opacity-70 lg:h-[760px] lg:w-[760px]"
          aspectClass="h-full w-full"
          sizes="(max-width: 640px) 280px, (max-width: 1024px) 520px, 760px"
        />
      </div>

      <Container className="relative pb-10 pt-10 md:pb-16 md:pt-12">
        <div className="relative z-10 w-full max-w-5xl">
          <div className="hidden md:block h-64" />

          <div className="md:flex md:flex-col">
            <h1 className="sr-only">Menos ruído. Mais resultados.</h1>
            <p className="hidden text-[11px] uppercase tracking-[0.4em] text-re7-gray/70 sm:block">
              Comunicação • Marketing • Tecnologia
            </p>

            <p className="mt-20 text-base text-re7-gray/90 md:mt-4 md:text-lg text-balance max-w-xl">
              Comunicação, marketing e tecnologia para negócios que querem crescer
              com estratégia.
            </p>
          </div>

          <div className="mt-6 md:mt-14 md:flex md:items-center md:justify-between md:gap-6">
            <div className="flex flex-wrap gap-1.5 text-[10px] text-re7-gray/85 sm:gap-4 sm:text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                Oferta clara
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                Página que converte
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5">
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
