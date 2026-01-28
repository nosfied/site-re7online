"use client";

import { useEffect, useState } from "react";
import Container from "@/components/Container";
import Button from "@/components/Button";

const nav = [
  { label: "Serviços", href: "#servicos" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Diagnóstico", href: "#diagnostico" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-re7-navy/80 backdrop-blur transition">
      <Container className="flex h-16 items-center justify-between">
        <a href="#topo" className="text-lg font-semibold tracking-tight text-white">
          Re7Online
        </a>

        <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button href="#diagnostico" variant="ghost">
            Falar no WhatsApp
          </Button>
          <Button href="#diagnostico" variant="primary">
            Solicitar diagnóstico
          </Button>
        </div>

        <button
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10 md:hidden"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
        >
          <span className="block h-0.5 w-5 bg-white" />
          <span className="mt-1.5 block h-0.5 w-5 bg-white/80" />
          <span className="mt-1.5 block h-0.5 w-5 bg-white/60" />
        </button>
      </Container>

      {open ? (
        <div className="fixed inset-0 z-50 bg-re7-navy/95 backdrop-blur md:hidden">
          <Container className="flex h-full flex-col gap-8 py-8">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Menu</span>
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>

            <nav className="flex flex-col gap-4 text-lg text-white/80">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="transition hover:text-white"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3">
              <Button href="#diagnostico" variant="primary" className="w-full">
                Solicitar diagnóstico
              </Button>
              <Button href="#diagnostico" variant="ghost" className="w-full">
                Falar no WhatsApp
              </Button>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
