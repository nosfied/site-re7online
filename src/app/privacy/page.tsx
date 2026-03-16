import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — Re7onlineWhats",
  description:
    "Política de Privacidade do Re7onlineWhats para atendimento aos requisitos de transparência e conformidade.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-re7-navy text-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-14 md:px-8">
        <header className="mb-10 border-b border-white/10 pb-6">
          <h1 className="text-3xl font-semibold md:text-4xl">
            Política de Privacidade — Re7onlineWhats
          </h1>
          <p className="mt-3 text-sm text-white/75">
            Última atualização: 15 de março de 2026
          </p>
        </header>

        <article className="space-y-8 text-sm leading-7 text-white/90 md:text-base">
          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">1. Quem somos</h2>
            <p>
              A Re7Online é uma plataforma de automação, atendimento e gestão conversacional para
              WhatsApp, operada pela Re7online, voltada ao uso empresarial por clientes
              contratantes.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">2. Escopo desta política</h2>
            <p>
              Esta Política de Privacidade descreve como tratamos dados pessoais e informações de
              uso no contexto do aplicativo Re7onlineWhats, incluindo automações de atendimento, CRM
              conversacional, inbox operacional, registro de interações e gestão de usuários por
              tenant.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">3. Dados que podemos tratar</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>nome</li>
              <li>número de telefone</li>
              <li>conteúdo de mensagens trocadas via WhatsApp</li>
              <li>data e hora das interações</li>
              <li>informações de leads e contatos comerciais</li>
              <li>status de atendimento</li>
              <li>notas operacionais inseridas por atendentes</li>
              <li>dados técnicos de uso da plataforma</li>
              <li>identificadores de usuários internos e operadores</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">4. Finalidade do tratamento</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>viabilizar atendimento e comunicação via WhatsApp</li>
              <li>automatizar respostas e fluxos conversacionais</li>
              <li>registrar histórico de atendimento</li>
              <li>permitir handoff entre bot e atendente humano</li>
              <li>organizar leads e contatos comerciais</li>
              <li>operar relatórios, auditoria e acompanhamento operacional</li>
              <li>manter segurança, estabilidade e rastreabilidade da plataforma</li>
              <li>cumprir obrigações legais e regulatórias aplicáveis</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">5. Base de tratamento</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>execução de contrato ou de procedimentos preliminares relacionados ao contrato</li>
              <li>legítimo interesse para operação, segurança e melhoria do serviço</li>
              <li>cumprimento de obrigação legal ou regulatória, quando aplicável</li>
              <li>consentimento, quando exigido pela legislação aplicável</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">6. Compartilhamento de dados</h2>
            <p>Os dados podem ser compartilhados, quando necessário, com:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>provedores de infraestrutura e hospedagem</li>
              <li>provedores de banco de dados e monitoramento</li>
              <li>Meta Platforms, no contexto da integração com WhatsApp Business Platform</li>
              <li>
                clientes contratantes da plataforma, na condição de controladores dos próprios
                atendimentos
              </li>
              <li>autoridades públicas, quando houver obrigação legal</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">7. Armazenamento e retenção</h2>
            <p>Os dados podem ser armazenados pelo tempo necessário para:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>execução das finalidades descritas nesta política</li>
              <li>cumprimento de obrigações legais</li>
              <li>exercício regular de direitos</li>
              <li>preservação de logs, histórico operacional e segurança da plataforma</li>
            </ul>
            <p className="mt-2">
              Quando possível e aplicável, os dados serão eliminados, anonimizados ou minimizados
              após o encerramento de sua necessidade.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">8. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados contra
              acesso não autorizado, perda, alteração, divulgação ou destruição indevida. Ainda
              assim, nenhum sistema é absolutamente invulnerável.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">9. Direitos do titular</h2>
            <p>Nos termos da legislação aplicável, o titular pode solicitar, quando cabível:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>confirmação da existência de tratamento</li>
              <li>acesso aos dados</li>
              <li>correção de dados incompletos, inexatos ou desatualizados</li>
              <li>anonimização, bloqueio ou eliminação de dados indevidos</li>
              <li>portabilidade, quando aplicável</li>
              <li>informações sobre compartilhamento</li>
              <li>revisão de decisões automatizadas, quando cabível</li>
              <li>revogação de consentimento, nos casos em que ele for a base legal</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">
              10. Responsabilidades dos clientes da plataforma
            </h2>
            <p>
              Quando a Re7onlineWhats é utilizada por empresas clientes para atendimento de seus
              próprios contatos, esses clientes podem atuar como controladores dos dados tratados em
              seus ambientes. Nesses casos, determinadas solicitações relacionadas ao conteúdo e à
              finalidade do atendimento poderão depender também do cliente contratante.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">
              11. Cookies e registros técnicos
            </h2>
            <p>
              A aplicação e seus ambientes associados podem utilizar registros técnicos, logs,
              identificadores de sessão e mecanismos estritamente necessários para autenticação,
              segurança, funcionamento da plataforma e análise operacional.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">12. Alterações desta política</h2>
            <p>
              Esta Política de Privacidade pode ser atualizada periodicamente para refletir
              melhorias do serviço, mudanças regulatórias ou ajustes operacionais. A versão mais
              atual estará sempre disponível nesta página.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-white">13. Contato</h2>
            <p>
              Para assuntos relacionados à privacidade e proteção de dados, entre em contato por:
            </p>
            <p className="mt-2">
              E-mail:{" "}
              <a className="text-re7-sky underline underline-offset-2" href="mailto:privacidade@re7online.com.br">
                privacidade@re7online.com.br
              </a>
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
