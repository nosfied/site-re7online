import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ConvertaCallout from "@/components/ConvertaCallout";
import Pillars from "@/components/Pillars";
import Services from "@/components/Services";
import HowItWorks from "@/components/HowItWorks";
import Diagnostic from "@/components/Diagnostic";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-re7-navy text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-re7-sky/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 rounded-full bg-re7-orange/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,19,42,0.8),rgba(6,19,42,1))]" />
      </div>
      <Header />

      <div className="relative pt-10">
        <Hero />
        <ConvertaCallout />
        <Pillars />
        <Services />
        <HowItWorks />
        <Diagnostic />
        <Footer />
      </div>
    </main>
  );
}
