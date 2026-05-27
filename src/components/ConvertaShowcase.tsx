import Container from "@/components/Container";
import Image from "next/image";

const showcase = [
  {
    title: "Inbox omnichannel",
    desc: "Fila única para WhatsApp, Instagram e Facebook/Messenger.",
    image: "/images/converta/screenshots/inbox-omnichannel.png",
  },
  {
    title: "Timeline da conversa",
    desc: "Histórico de mensagens, canal, status e contexto do atendimento.",
    image: "/images/converta/screenshots/timeline-conversa.png",
  },
  {
    title: "Campanhas oficiais",
    desc: "Estrutura preparada para disparos oficiais e follow-up rastreável.",
    image: "/images/converta/screenshots/campanhas.png",
  },
  {
    title: "CRM conversacional",
    desc: "Histórico, status, anotações e contexto comercial no atendimento.",
    image: "/images/converta/screenshots/crm.png",
  },
];

export default function ConvertaShowcase() {
  return (
    <section id="em-acao" className="scroll-mt-24 py-8 md:py-12">
      <Container>
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.24em] text-re7-gray/70">Solução em ação</p>
            <h2 className="mt-3 text-2xl font-semibold text-white text-balance md:text-4xl">
              Veja o CONVERTA em ação.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-re7-gray/85 md:text-lg">
            Acompanhe cada atendimento, lead e campanha em uma experiência visual simples para a equipe
            operar melhor e vender com mais contexto.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {showcase.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.045] p-2.5 sm:p-4">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#081327]">
                <Image
                  src={item.image}
                  alt={item.title}
                  width={1844}
                  height={959}
                  className="h-auto w-full object-contain"
                />
              </div>
              <div className="px-1 pt-3 sm:pt-4">
                <p className="text-lg font-semibold text-white md:text-xl">{item.title}</p>
                <p className="mt-2 text-base leading-7 text-white/64">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
