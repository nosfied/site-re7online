import Image from "next/image";
import Link from "next/link";

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.52 3.48A11.86 11.86 0 0 0 12.07 0C5.53 0 .2 5.32.2 11.87c0 2.09.55 4.14 1.58 5.95L0 24l6.37-1.67a11.82 11.82 0 0 0 5.7 1.46h.01c6.54 0 11.87-5.32 11.87-11.87 0-3.17-1.23-6.14-3.43-8.44Z"
        fill="currentColor"
      />
      <path
        d="M9.08 6.54c-.23-.52-.47-.53-.69-.54h-.59c-.2 0-.52.08-.79.37-.27.3-1.04 1.01-1.04 2.46 0 1.45 1.07 2.85 1.22 3.05.15.2 2.1 3.37 5.18 4.59 2.55 1.01 3.08.81 3.63.76.55-.05 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35-.29-.15-1.77-.87-2.04-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.64-2.03-.17-.3-.02-.46.13-.61.13-.13.29-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.71-.94-2.31Z"
        fill="#081327"
      />
      <path
        d="M12.07 21.62h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.78.99 1.01-3.69-.23-.38a9.85 9.85 0 0 1-1.52-5.26c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.11 1.03 6.98 2.9a9.82 9.82 0 0 1 2.9 6.99c0 5.45-4.44 9.89-9.88 9.89Z"
        fill="white"
      />
      <path
        d="M9.08 6.54c-.23-.52-.47-.53-.69-.54h-.59c-.2 0-.52.08-.79.37-.27.3-1.04 1.01-1.04 2.46 0 1.45 1.07 2.85 1.22 3.05.15.2 2.1 3.37 5.18 4.59 2.55 1.01 3.08.81 3.63.76.55-.05 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35-.29-.15-1.77-.87-2.04-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.64-2.03-.17-.3-.02-.46.13-.61.13-.13.29-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.71-.94-2.31Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AccessButton() {
  return (
    <Link
      href="https://admin.re7online.com/app/login"
      className="inline-flex items-center justify-center rounded-2xl bg-[#20b15a] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
    >
      Acessar sistema
    </Link>
  );
}

function WhatsAppBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/14 px-3 py-1 text-xs font-medium text-emerald-100">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#25d366] text-white shadow-sm">
        <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />
      </span>
      WhatsApp
    </div>
  );
}

export default function SistemasPage() {
  return (
    <main className="flex min-h-screen overflow-hidden bg-re7-navy text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-re7-sky/80">Re7</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            Sistemas Re7
          </h1>
          <p className="mt-2 text-sm text-white/72 sm:text-base">Acesse as solucoes digitais da Re7.</p>
        </div>

        <div className="mt-6 grid max-w-[26rem] gap-4 sm:mt-8">
          <article className="group rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_52px_rgba(0,0,0,0.22)] transition hover:-translate-y-1 hover:border-re7-sky/30 hover:shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Converta</span>
              <WhatsAppBadge />
            </div>

            <div className="mt-4 flex min-h-[128px] items-center justify-center rounded-2xl border border-white/8 bg-[#081327] px-4 py-6 sm:min-h-[144px]">
              <Image
                src="/images/converta-logo-dark.png"
                alt="Converta"
                width={320}
                height={120}
                priority
                className="h-auto w-full max-w-[210px] object-contain sm:max-w-[220px]"
              />
            </div>

            <div className="mt-5">
              <h2 className="text-xl font-semibold text-white sm:text-2xl">Converta</h2>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Atendimento inteligente via WhatsApp com automacao, campanhas, chatbot, midia e gestao de leads.
              </p>
            </div>

            <div className="mt-5">
              <AccessButton />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
