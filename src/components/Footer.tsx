import Container from "@/components/Container";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-10">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Re7Online</p>
            <p className="mt-1 text-xs text-white/60">
              Atendemos Natal/RN e projetos no Brasil todo.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-white/70">
            <a className="hover:text-white" href="#servicos">
              Serviços
            </a>
            <a className="hover:text-white" href="#como-funciona">
              Como funciona
            </a>
            <a className="hover:text-white" href="#diagnostico">
              Diagnóstico
            </a>
          </div>

          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Re7Online. Todos os direitos reservados.
          </p>
        </div>
      </Container>
    </footer>
  );
}
