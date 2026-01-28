"use client";

import { FormEvent, useMemo, useState } from "react";
import Container from "@/components/Container";
import Button from "@/components/Button";

const WHATSAPP_NUMBER = "5584992172110";

const segments = [
  "Serviços",
  "Saúde",
  "Varejo",
  "Educação",
  "Tecnologia",
  "Outro",
];

const goals = [
  "Gerar leads qualificados",
  "Aumentar vendas",
  "Fortalecer marca",
  "Organizar a presença digital",
];

export default function Diagnostic() {
  const [name, setName] = useState("");
  const [whats, setWhats] = useState("");
  const [segment, setSegment] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");

  const message = useMemo(() => {
    return `Olá! Quero solicitar um diagnóstico. Nome: ${
      name || "[nome]"
    }. WhatsApp: ${whats || "[whats]"}. Segmento: ${
      segment || "[segmento]"
    }. Objetivo: ${goal || "[objetivo]"}.`;
  }, [name, whats, segment, goal]);

  const whatsappHref = useMemo(() => {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      message
    )}`;
  }, [message]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name || !whats || !segment || !goal) {
      setError("Preencha todos os campos para continuar.");
      return;
    }
    setError("");
    window.open(whatsappHref, "_blank", "noopener,noreferrer");
  }

  return (
    <section id="diagnostico" className="scroll-mt-24 py-16">
      <Container>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/6 via-white/3 to-transparent p-8 md:p-12">
          <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-re7-gray/70">
                Diagnóstico
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                Vamos estruturar sua presença digital com estratégia.
              </h2>
              <p className="mt-4 text-sm text-re7-gray/85 md:text-base">
                Conte rapidamente sobre seu negócio e receba orientações práticas
                para melhorar resultados.
              </p>
              <p className="mt-6 text-xs text-re7-gray/70">
                Você será direcionado para o WhatsApp. Não armazenamos seus dados
                neste site.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <div className="space-y-4 text-sm text-re7-gray/80">
                <label className="block">
                  Nome
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Seu nome"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-re7-navy/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-re7-sky focus:outline-none"
                    required
                  />
                </label>
                <label className="block">
                  WhatsApp
                  <input
                    value={whats}
                    onChange={(event) => setWhats(event.target.value)}
                    placeholder="(DDD) 99999-9999"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-re7-navy/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-re7-sky focus:outline-none"
                    required
                  />
                </label>
                <label className="block">
                  Segmento
                  <select
                    value={segment}
                    onChange={(event) => setSegment(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-re7-navy/60 px-4 py-3 text-sm text-white focus:border-re7-sky focus:outline-none"
                    required
                  >
                    <option value="">Selecione</option>
                    {segments.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Objetivo
                  <select
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-re7-navy/60 px-4 py-3 text-sm text-white focus:border-re7-sky focus:outline-none"
                    required
                  >
                    <option value="">Selecione</option>
                    {goals.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {error ? (
                <p className="mt-3 text-xs text-re7-amber">{error}</p>
              ) : null}
              <Button type="submit" variant="primary" className="mt-5 w-full">
                Enviar no WhatsApp
              </Button>
            </form>
          </div>
        </div>
      </Container>
    </section>
  );
}
