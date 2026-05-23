import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import Container from "@/components/Container";
import ConvertaHighlights from "@/components/ConvertaHighlights";
import ConvertaShowcase from "@/components/ConvertaShowcase";
import Plans from "@/components/Plans";
import { buildWhatsAppUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Converta | Central Inteligente de Atendimento e Vendas",
  description:
    "Centralize WhatsApp, Instagram e Facebook/Messenger em um atendimento omnichannel com CRM conversacional, automação e IA supervisionada.",
};

const channels = ["WhatsApp oficial", "Instagram", "Facebook/Messenger", "CRM", "IA supervisionada", "App mobile"];

export default function ConvertaPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-re7-navy text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-re7-sky/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 rounded-full bg-re7-orange/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,19,42,0.74),rgba(6,19,42,1))]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-re7-navy/70 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Re7Online
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a className="hover:text-white" href="#converta">
              Recursos
            </a>
            <a className="hover:text-white" href="#em-acao">
              Em ação
            </a>
            <a className="hover:text-white" href="#planos">
              Planos
            </a>
          </nav>
          <Button href={buildWhatsAppUrl()} variant="ghost" target="_blank" rel="noreferrer">
            Falar no WhatsApp
          </Button>
        </Container>
      </header>

      <section className="relative z-10 pb-10 pt-8 md:pb-14 md:pt-20">
        <Container className="max-w-[1580px]">
          <div>
            <div className="mx-auto mb-5 max-w-7xl">
              <p className="inline-flex w-fit items-center rounded-full border border-re7-sky/25 bg-re7-sky/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-re7-sky">
                Central Inteligente de Atendimento e Vendas
              </p>
            </div>

            <div className="relative mx-auto max-w-7xl rounded-[1.15rem] border border-white/10 bg-white/[0.045] p-1 shadow-2xl shadow-black/30 sm:rounded-[1.45rem] md:p-2">
              <Image
                src="/images/converta/screenshots/principal.png"
                alt="Tela principal do Converta com inbox omnichannel"
                width={1538}
                height={585}
                priority
                className="h-auto w-full rounded-[0.85rem] border border-white/10 object-contain sm:rounded-[1.05rem]"
              />
              <div className="mt-3 grid gap-2 sm:absolute sm:bottom-6 sm:left-6 sm:mt-0 sm:flex sm:flex-row">
                <Button href={buildWhatsAppUrl()} variant="primary" className="shadow-2xl shadow-black/30 sm:w-auto" target="_blank" rel="noreferrer">
                  Solicitar demonstração
                </Button>
                <Button href="#planos" variant="secondary" className="!border-re7-sky !bg-re7-sky !text-re7-navy shadow-2xl shadow-black/25 hover:!bg-re7-sky/90 sm:w-auto">
                  Ver planos
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-5 flex max-w-7xl flex-wrap justify-center gap-2 text-[10px] text-re7-gray/85 sm:gap-6 sm:text-sm lg:gap-10">
              {channels.map((channel) => (
                <span
                  key={channel}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 sm:px-3"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-re7-amber" />
                  {channel}
                </span>
              ))}
            </div>

            <div className="mx-auto mt-8 grid max-w-7xl gap-4 md:grid-cols-[0.82fr_1fr] md:items-start">
              <h1 className="text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl lg:text-5xl">
                Transforme conversas em vendas com o Converta.
              </h1>
              <p className="text-sm leading-6 text-white/86 md:text-base lg:text-lg lg:leading-7">
                Centralize WhatsApp, Instagram e Facebook em um único atendimento com automação,
                IA supervisionada, CRM conversacional e campanhas oficiais.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <div className="relative z-10">
        <ConvertaHighlights />
        <ConvertaShowcase />
        <Plans />
      </div>
    </main>
  );
}
