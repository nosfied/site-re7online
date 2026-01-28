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
  const [, setScrolled] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/15 md:hidden"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <span className="block h-0.5 w-5 bg-white" />
          <span className="mt-1.5 block h-0.5 w-5 bg-white/90" />
          <span className="mt-1.5 block h-0.5 w-5 bg-white/80" />
        </button>
      </Container>

      {open ? (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            id="mobile-menu"
            className="absolute right-0 top-0 h-full w-[86%] max-w-xs border-l border-white/10 bg-re7-navy/95 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col gap-6 px-6 py-6">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-white">Menu</span>
                <button
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white"
                  aria-label="Fechar menu"
                  onClick={() => setOpen(false)}
                >
                  Fechar
                </button>
              </div>

              <nav className="flex flex-col gap-4 text-base text-white/85">
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
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
