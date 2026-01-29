"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

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
    const onNavigate = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onNavigate);
    window.addEventListener("popstate", onNavigate);
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/40 bg-white/20 text-white shadow-lg shadow-black/30 transition hover:bg-white/30 md:hidden"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <svg
            width="22"
            height="18"
            viewBox="0 0 22 18"
            aria-hidden="true"
            className="text-white"
            fill="none"
          >
            <path
              d="M1 2h20M1 9h20M1 16h20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </Container>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[999] bg-re7-navy/60 md:hidden"
              onClick={() => setOpen(false)}
            >
              <div
                id="mobile-menu"
                className="absolute inset-0 h-full w-full bg-re7-navy/80 shadow-2xl ring-1 ring-white/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex h-full flex-col gap-6 px-6 py-7">
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

                  <nav
                    className="flex flex-col gap-5 text-base text-white/90"
                    onClick={() => setOpen(false)}
                  >
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
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
