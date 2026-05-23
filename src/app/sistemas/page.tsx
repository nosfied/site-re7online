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

function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="instagram-gradient" x1="2" x2="22" y1="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#feda75" />
          <stop offset="0.28" stopColor="#fa7e1e" />
          <stop offset="0.52" stopColor="#d62976" />
          <stop offset="0.75" stopColor="#962fbf" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect width="20" height="20" x="2" y="2" rx="6" fill="url(#instagram-gradient)" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="white" />
    </svg>
  );
}

function MessengerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="messenger-gradient" x1="4" x2="20" y1="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00b2ff" />
          <stop offset="0.52" stopColor="#006aff" />
          <stop offset="1" stopColor="#a033ff" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C6.48 2 2.18 6.04 2.18 11.5c0 2.86 1.18 5.35 3.12 7.08v3.16l2.85-1.56c1.15.52 2.45.82 3.85.82 5.52 0 9.82-4.04 9.82-9.5S17.52 2 12 2Z"
        fill="url(#messenger-gradient)"
      />
      <path d="m6.95 14.28 3.05-4.84 3.24 2.43 3.78-2.43-3.05 4.84-3.24-2.43-3.78 2.43Z" fill="white" />
    </svg>
  );
}

function AccessButton() {
  const href =
    process.env.NODE_ENV === "development" ? "/app/login" : "https://converta.re7online.com/app/login";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-full items-center justify-center rounded-2xl bg-[#20b15a] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 sm:w-auto sm:px-5"
    >
      Acessar sistema
    </a>
  );
}

const channelBadges = [
  {
    label: "WhatsApp",
    description: "Atendimento, automacao e campanhas pelo canal principal.",
    icon: <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />,
    className: "border-emerald-400/30 bg-emerald-500/14 text-emerald-100",
    iconClassName: "bg-[#25d366] text-white",
  },
  {
    label: "Instagram",
    description: "Direct integrado ao inbox omnichannel.",
    icon: <InstagramIcon className="h-4 w-4" />,
    className: "border-pink-300/30 bg-pink-500/14 text-pink-100",
    iconClassName: "bg-white/10",
  },
  {
    label: "Facebook/Messenger",
    description: "Mensagens da pagina em uma fila unica de atendimento.",
    icon: <MessengerIcon className="h-4 w-4" />,
    className: "border-sky-300/30 bg-sky-500/14 text-sky-100",
    iconClassName: "bg-white/10",
  },
];

export default function SistemasPage() {
  return (
    <main className="flex min-h-screen overflow-x-hidden bg-re7-navy text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-start px-3 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 lg:px-8">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-re7-sky/80">Re7</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[2.35rem]">
            Sistemas Re7online
          </h1>
          <p className="mt-1.5 text-sm text-white/72">Acesse as solucoes digitais da Re7.</p>
        </div>

        <div className="mx-auto mt-8 grid w-full max-w-sm gap-4 sm:mt-10">
          <article className="group rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_16px_42px_rgba(0,0,0,0.2)] transition hover:-translate-y-1 hover:border-re7-sky/30 hover:shadow-[0_20px_48px_rgba(0,0,0,0.26)]">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Converta</span>
            </div>

            <div className="mt-4 flex min-h-[78px] items-center justify-center rounded-2xl border border-white/8 bg-[#081327] px-3 py-4">
              <Image
                src="/images/converta-logo-light.png"
                alt="Converta"
                width={320}
                height={120}
                priority
                className="h-auto w-full max-w-[182px] object-contain"
              />
            </div>

            <div className="mt-4">
              <h2 className="text-lg font-semibold text-white">Converta</h2>
              <p className="mt-1.5 text-xs leading-5 text-white/72">
                Atendimento omnichannel para WhatsApp, Instagram e Facebook/Messenger com inbox unificado,
                automacao, campanhas, IA supervisionada, midia e gestao de leads.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              {channelBadges.map((badge) => (
                <div key={badge.label} className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
                  <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${badge.iconClassName}`}>
                    {badge.icon}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-white">{badge.label}</p>
                    <p className="mt-0.5 text-[0.72rem] leading-4 text-white/58">{badge.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <AccessButton />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
