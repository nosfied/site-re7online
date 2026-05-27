import Image from "next/image";
import Container from "@/components/Container";
import Button from "@/components/Button";

export default function ConvertaCallout() {
  return (
    <section className="py-6 md:py-8">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/10 sm:p-5 md:p-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-re7-sky md:inset-y-0 md:left-0 md:h-auto md:w-1" />
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
              <div className="inline-flex h-9 w-[130px] shrink-0 items-center overflow-hidden sm:h-10 sm:w-[142px]">
                <Image
                  src="/images/converta-logo-light.png"
                  alt="Converta"
                  width={162}
                  height={203}
                  className="h-[183px] w-[146px] object-cover object-center sm:h-[203px] sm:w-[162px]"
                  sizes="162px"
                />
              </div>

              <div className="min-w-0 sm:border-l sm:border-white/10 sm:pl-5">
                <h2 className="text-[1.28rem] font-semibold leading-tight text-white text-balance sm:text-xl md:text-2xl">
                  Central inteligente para organizar atendimento e vendas.
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-re7-gray/85 sm:leading-6">
                  WhatsApp, Instagram e Facebook/Messenger em uma operação única com CRM, IA supervisionada e atendimento humano.
                </p>
              </div>
            </div>

            <Button href="/converta" variant="primary" className="w-full shrink-0 sm:w-auto md:w-auto">
              Conhecer o Converta
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
