import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import Container from "@/components/Container";
import ConvertaAudiences from "@/components/ConvertaAudiences";
import ConvertaDiagnosis from "@/components/ConvertaDiagnosis";
import ConvertaFinalCta from "@/components/ConvertaFinalCta";
import ConvertaHighlights from "@/components/ConvertaHighlights";
import ConvertaOperations from "@/components/ConvertaOperations";
import ConvertaShowcase from "@/components/ConvertaShowcase";
import Plans from "@/components/Plans";
import { buildWhatsAppUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Converta | Controle operacional para atendimento e vendas",
  description:
    "Central inteligente de operação comercial e atendimento para WhatsApp, Instagram e Messenger com CRM conversacional, IA supervisionada e previsibilidade de vendas.",
  keywords: [
    "central de atendimento WhatsApp",
    "CRM conversacional",
    "WhatsApp oficial",
    "IA para atendimento",
    "atendimento omnichannel",
    "automação comercial",
  ],
};

const channels = ["WhatsApp oficial", "Instagram", "Messenger", "CRM conversacional", "IA supervisionada", "Operação mobile"];

export default function ConvertaPage() {
  const demoUrl = buildWhatsAppUrl("Ola! Quero ver como o Converta organiza meu atendimento e para de perder vendas.");

  return (
    <main className="public-mobile-scroll relative min-h-screen overflow-x-hidden bg-re7-navy pb-24 text-white md:pb-0">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-re7-sky/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 rounded-full bg-re7-orange/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,19,42,0.74),rgba(6,19,42,1))]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-re7-navy/90 backdrop-blur">
        <Container className="flex flex-col gap-2 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:gap-4 md:py-0">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 md:w-auto">
            <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight text-white">
              Re7Online
            </Link>
            <Button href={demoUrl} variant="ghost" className="px-3 text-xs md:hidden" target="_blank" rel="noreferrer">
              Quero ver funcionando
            </Button>
          </div>
          <nav className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 text-xs text-white/74 [-ms-overflow-style:none] [scrollbar-width:none] [&>a]:shrink-0 [&>a]:whitespace-nowrap [&::-webkit-scrollbar]:hidden md:w-auto md:gap-6 md:overflow-visible md:pb-0 md:text-sm md:text-white/70">
            <a className="hover:text-white" href="#diagnostico">
              Diagnóstico
            </a>
            <a className="hover:text-white" href="#converta">
              Controle
            </a>
            <a className="hover:text-white" href="#em-acao">
              Em ação
            </a>
            <a className="hover:text-white" href="#planos">
              Planos
            </a>
          </nav>
          <Button href={demoUrl} variant="ghost" className="hidden px-3 text-xs sm:px-4 sm:text-sm md:inline-flex" target="_blank" rel="noreferrer">
            Quero ver funcionando
          </Button>
        </Container>
      </header>

      <section className="relative z-10 min-h-[calc(100svh-4rem)] overflow-hidden pb-8 pt-5 md:min-h-[calc(100dvh-4rem)] md:pb-14 md:pt-10">
        <Image
          src="/images/converta/screenshots/principal1.png"
          alt=""
          fill
          priority
          className="pointer-events-none object-cover object-[58%_center] md:object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,19,42,0.98)_0%,rgba(6,19,42,0.92)_60%,rgba(6,19,42,0.54)_100%)] md:bg-[linear-gradient(90deg,rgba(6,19,42,0.98)_0%,rgba(6,19,42,0.94)_32%,rgba(6,19,42,0.58)_58%,rgba(6,19,42,0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-re7-navy to-transparent" />

        <Container className="relative z-10">
          <div className="flex max-w-xl flex-col md:min-h-[calc(100dvh-8rem)] lg:min-h-[720px] xl:min-h-[760px]">
            <div>
              <p className="inline-flex w-full max-w-full items-center justify-center overflow-hidden rounded-full border border-re7-sky/25 bg-re7-navy/70 px-1 py-1.5 text-[0.42rem] font-semibold uppercase tracking-0 text-re7-sky backdrop-blur whitespace-nowrap min-[390px]:text-[0.44rem] sm:w-fit sm:max-w-full sm:px-2.5 sm:text-[0.62rem] sm:tracking-[0.08em] lg:text-[0.58rem] lg:tracking-[0.06em] xl:text-[0.68rem] xl:tracking-[0.1em]">
                Central Inteligente de Operação Comercial e Atendimento
              </p>

              <h1 className="mt-4 text-[2.35rem] font-semibold leading-[1.05] tracking-tight text-white text-balance min-[390px]:text-[2.5rem] sm:text-5xl lg:mt-5 lg:text-6xl">
                Seu problema não é falta de leads.
                <span className="block text-re7-sky">É falta de controle do atendimento.</span>
              </h1>

              <p className="mt-4 text-base leading-7 text-white/88 sm:text-lg sm:leading-8 lg:mt-5 lg:text-xl lg:leading-9">
                O Converta centraliza WhatsApp, Instagram e Messenger em uma operação inteligente com
                IA, CRM conversacional e acompanhamento em tempo real.
              </p>

              <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap lg:mt-6">
                <Button href={demoUrl} variant="primary" className="shadow-2xl shadow-black/30 sm:w-auto" target="_blank" rel="noreferrer">
                  Quero ver funcionando
                </Button>
                <Button href={buildWhatsAppUrl("Ola! Quero solicitar uma demonstracao do Converta.")} variant="secondary" className="!border-re7-sky !bg-re7-sky !text-re7-navy shadow-2xl shadow-black/25 hover:!bg-re7-sky/90 sm:w-auto" target="_blank" rel="noreferrer">
                  Solicitar demonstração
                </Button>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-4 lg:mt-auto lg:gap-5">
              <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-2 rounded-3xl border border-white/10 bg-re7-navy/72 p-3 text-center backdrop-blur">
                <div>
                  <p className="text-2xl font-semibold text-white">3</p>
                  <p className="mt-1 text-[11px] leading-4 text-re7-gray/72 sm:text-xs">canais em uma fila</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">24h</p>
                  <p className="mt-1 text-[11px] leading-4 text-re7-gray/72 sm:text-xs">de histórico visível</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">0</p>
                  <p className="mt-1 text-[11px] leading-4 text-re7-gray/72 sm:text-xs">lead sem dono</p>
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-2 text-[11px] text-re7-gray/85 min-[390px]:text-xs sm:grid-cols-3 sm:text-sm">
                {channels.map((channel) => (
                  <span
                    key={channel}
                    className="inline-flex min-w-0 max-w-full items-center justify-start gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-re7-navy/64 px-2 py-1.5 backdrop-blur sm:gap-2 sm:px-3"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-re7-amber" />
                    <span className="min-w-0">{channel}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <div className="relative z-10">
        <ConvertaDiagnosis />
        <ConvertaAudiences />
        <ConvertaOperations />
        <ConvertaHighlights />
        <ConvertaShowcase />
        <Plans />
        <ConvertaFinalCta />
      </div>

    </main>
  );
}
