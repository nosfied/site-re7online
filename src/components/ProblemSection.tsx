import Container from "./Container";

export default function ProblemSection() {
  return (
    <section className="py-14 md:py-20">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              O problema não é <span className="text-white">“falta de marketing”</span>.{" "}
              <span className="text-white/80">É falta de estrutura.</span>
            </h2>

            <p className="mt-4 text-white/70">
              Quando a comunicação não está clara, o cliente até chega até você…
              mas não entende rápido o suficiente para tomar uma decisão.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-white/70">
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-re7-orange" />
                Site que não explica o serviço e não direciona para contato
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-re7-orange" />
                Redes sociais sem linha editorial e sem chamada para ação
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-re7-orange" />
                Campanhas sem rastreio básico (e sem aprendizado)
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6">
            <p className="text-sm font-semibold text-white">O que fazemos na prática</p>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">Organizamos o “sistema”</p>
                <p className="mt-1 text-sm text-white/70">
                  Você não precisa de um projeto gigante para começar bem.
                  Precisa de um conjunto mínimo funcionando:
                  oferta clara + página objetiva + CTA + rotina.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">Evoluímos com consistência</p>
                <p className="mt-1 text-sm text-white/70">
                  A cada semana: melhorias, ajustes de copy, campanhas e conteúdo —
                  sempre com objetivo, sem ruído.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
