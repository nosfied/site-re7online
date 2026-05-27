"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/Button";
import Container from "@/components/Container";

type ConvertaHeaderProps = {
  demoUrl: string;
};

const nav = [
  { label: "Diagnóstico", href: "#diagnostico" },
  { label: "Controle", href: "#converta" },
  { label: "Em ação", href: "#em-acao" },
  { label: "Planos", href: "#planos" },
];

export default function ConvertaHeader({ demoUrl }: ConvertaHeaderProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onNavigate = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onNavigate);
    window.addEventListener("popstate", onNavigate);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onNavigate);
      window.removeEventListener("popstate", onNavigate);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-re7-navy/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <a href="#inicio" className="inline-flex h-[25px] shrink-0 items-center overflow-hidden md:h-[50px]">
          <Image
            src="/images/converta-logo-light.png"
            alt="Converta"
            width={203}
            height={254}
            className="h-[127px] w-[102px] object-cover object-center md:h-[254px] md:w-[203px]"
            sizes="(min-width: 768px) 203px, 102px"
          />
        </a>

        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          {nav.map((item) => (
            <a key={item.href} className="transition hover:text-white" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <Button href={demoUrl} variant="ghost" className="hidden px-3 text-xs sm:px-4 sm:text-sm md:inline-flex" target="_blank" rel="noreferrer">
          Quero ver funcionando
        </Button>

        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/40 bg-white/20 text-white shadow-lg shadow-black/30 transition hover:bg-white/30 md:hidden"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="converta-mobile-menu"
          onClick={() => setOpen(true)}
        >
          <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true" className="text-white" fill="none">
            <path d="M1 2h20M1 9h20M1 16h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </Container>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[999] bg-re7-navy/60 md:hidden" onClick={() => setOpen(false)}>
              <div
                id="converta-mobile-menu"
                className="absolute inset-0 h-full w-full bg-re7-navy/95 shadow-2xl ring-1 ring-white/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex h-full flex-col gap-6 px-5 py-6">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-white">Menu</span>
                    <button
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white"
                      aria-label="Fechar menu"
                      onClick={() => setOpen(false)}
                    >
                      Fechar
                    </button>
                  </div>

                  <nav className="flex flex-col gap-3 text-base text-white/90" onClick={() => setOpen(false)}>
                    {nav.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:text-white"
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>

                  <div className="mt-auto flex flex-col gap-3">
                    <Button href={demoUrl} variant="primary" className="w-full" target="_blank" rel="noreferrer">
                      Quero ver funcionando
                    </Button>
                    <Button href="#planos" variant="ghost" className="w-full">
                      Ver planos
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
