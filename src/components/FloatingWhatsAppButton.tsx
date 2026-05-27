import Image from "next/image";
import { buildWhatsAppUrl } from "@/lib/siteConfig";

type FloatingWhatsAppButtonProps = {
  message: string;
  label?: string;
};

export default function FloatingWhatsAppButton({
  message,
  label = "Falar no WhatsApp",
}: FloatingWhatsAppButtonProps) {
  return (
    <a
      href={buildWhatsAppUrl(message)}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="fixed right-4 z-[70] inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#25d366] text-white shadow-[0_16px_36px_rgba(0,0,0,0.32)] ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[#25d366]/35 sm:right-6 sm:h-16 sm:w-16"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
    >
      <Image
        src="/images/converta/icozap.jpg"
        alt=""
        width={64}
        height={64}
        className="h-full w-full shrink-0 object-cover sm:h-16 sm:w-16"
        sizes="64px"
      />
    </a>
  );
}
