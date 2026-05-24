import Container from "@/components/Container";

const symptoms = [
  "Lead demora para receber resposta?",
  "Cliente some depois do primeiro contato?",
  "Ninguém acompanha o comercial até o fim?",
  "Seu time responde cada pessoa de um jeito?",
  "Você não sabe quem está vendendo de verdade?",
  "Instagram, WhatsApp e Facebook ficam separados?",
  "O lead esfria porque ninguém continua o atendimento?",
  "Você sente que perde dinheiro sem saber onde?",
];

export default function ConvertaDiagnosis() {
  return (
    <section id="diagnostico" className="scroll-mt-24 py-8 md:py-14">
      <Container>
        <div className="rounded-[1.75rem] border border-re7-orange/30 bg-[linear-gradient(135deg,rgba(252,108,22,0.16),rgba(127,196,229,0.08))] p-5 shadow-2xl shadow-black/20 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-re7-amber">
                Diagnóstico rápido
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white text-balance md:text-5xl">
                Talvez o problema não seja o tráfego.
              </h2>
              <p className="mt-4 text-lg leading-8 text-white/86">
                Muitas empresas acham que precisam de mais leads, quando na verdade estão perdendo os leads
                que já chegam por falta de processo, visibilidade e acompanhamento.
              </p>
            </div>

            <div className="grid gap-2.5">
              {symptoms.map((symptom) => (
                <div
                  key={symptom}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#081327]/70 px-4 py-3 text-base text-white shadow-lg shadow-black/10"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-re7-sky/40 bg-re7-sky/10 text-re7-sky">
                    □
                  </span>
                  <span>{symptom}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-re7-navy/80 p-4 text-center md:p-5">
            <p className="text-xl font-semibold text-white md:text-2xl">Então o problema é operacional.</p>
            <p className="mx-auto mt-2 max-w-3xl text-base leading-7 text-re7-gray/85">
              O Converta existe para revelar onde o atendimento quebra, quem precisa agir e quais oportunidades
              ainda podem ser recuperadas.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
