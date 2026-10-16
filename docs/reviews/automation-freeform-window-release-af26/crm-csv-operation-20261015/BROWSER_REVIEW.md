# Revisão de navegador com API e PostgreSQL reais locais — 15/10/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Complementa a entrega a27e2d16. [Provas sanitizadas](BROWSER_PROOFS_SANITIZED.json), [comparação com a base](TYPECHECK_BASE_COMPARISON.json), [publicação coordenada](COORDINATED_PUBLICATION.md).

## Quatro frentes reconciliadas com o contrato canônico

| Frente | Constatação e resolução | Prova |
|---|---|---|
| Resultado durável, timeout e admissão | UNKNOWN continua diferente de FAILED. Referência sem admissão observada agora explica a ausência de comprovação, sem concluir ausência de gravações ou liberar retry | Chrome real, GET real, recibos por SELECT; input bloqueado no estado desconhecido |
| Recuperação e ciclo da interface | Encontrado defeito: terminal recuperado deixava a lista em62 embora houvesse64. POST e GET agora compartilham o reconhecimento de conclusão e atualizam a lista uma vez por operação; erro da atualização não altera o resultado do CSV. Referência visível e botões separados | Antes/depois visual; timeout real, fechar/reabrir, recarga, terminal e ação explícita para nova importação |
| Contagens, filtros e página | Total permitido64, busca5 e página2 com14; busca vazia preserva64/0/0. Anonimizado fora da projeção. Sem alterar regra de titular/retenção | Navegador + API real + PostgreSQL sintético; RBAC/tenant das21 provas HTTP anteriores reutilizados, sem simular autorização pela UI |
| Compatibilidade da troca | API nova recusa POST sem UUID antes de escrever. Abas antigas requerem recarga; frontend novo não pode apontar para API antiga. Retorno não pode apagar dependência do ledger | 400 real e SELECT sem contato legado; matriz/ordem obrigatória de publicação e limites explícitos |

## Ambiente e cenários

Chrome headless separado, Next dev/webpack em127.0.0.1:55783, handler HTTP real em55782 e PostgreSQL16 sintético em55781/retention_lab. Nenhum worker iniciado. O harness utiliza o ponto canônico setPrismaForTesting: apenas a gravação do evento classified é seguida por espera controlada de18s; admissão, parser, upsert, transações, eventos, autorização e projeção são reais. O AbortController do cliente vence aos10s. Não é resposta JSON simulada e não aumenta o timeout do produto.

Dois tenants sintéticos independentes verificaram o antes/depois. Cada caso admitiu uma operação, com duas linhas novas: started1/classified1/row2/finished1, COMPLETED/created2/failed0 e64 Leads visíveis. Uma linha anonimizada adicional permanece oculta. Não houve replay da mesma operação. A repetição dirigida após corrigir a atualização usou outro tenant sintético.

No caso final: um POST, AbortError observado, GET enquanto processamento; fechamento/reabertura e recarga mantiveram a mesma referência; GET recuperou o terminal e o total64. O driver e o recibo do banco vinculam a operação pelo UUID, sem correlação por nome/horário. O POST abortado pode não aparecer como resposta terminada no log do servidor; a prova usa o abort observado no navegador e o terminal durável, sem inferir rollback pelo socket.

Terminal pode ser consultado e fechado/reaberto sem POST; “Preparar outra importação” limpa somente a referência terminal do escopo. Na fixture sem admissão comprovada o GET retorna UNKNOWN, a explicação nega retry e o arquivo fica bloqueado. O reset dessa fixture no driver é somente limpeza do cenário sintético, não mecanismo proposto de recuperação para o operador.

## Evidência visual

- [Prévia/amostra](browser/evidence/01-preview.png).
- [Defeito antes da correção: terminal](browser/evidence/04-terminal-before-refresh-fix.png), texto/dom capturou62 enquanto o banco já tinha64 visíveis.
- [Timeout final](browser/evidence/10-timeout-final.png), [recarga em processamento](browser/evidence/11-reload-final.png) e [terminal final](browser/evidence/12-terminal-final.png).
- [Referência sem admissão observada](browser/evidence/13-unobserved-final.png).
- [Página2](browser/evidence/07-page-two.png), [busca5](browser/evidence/08-filtered.png), [busca vazia](browser/evidence/09-empty-filter.png).

Capturas contêm exclusivamente identidades/dados sintéticos. Não há tokens, headers ou configurações nas imagens. Inspeção visual dirigida executada; ajustes de botões de acompanhamento evitam concatenação. Não é aceite do owner em produção, teste mobile ou certificação de carga.

## Typecheck e reuso

Comparação real com7f79cee6 (base anterior ao CSV), mesmas dependências/compilador/next-env: **22 erros, diagnósticos byte a byte idênticos** à versão candidata. Arquivos/linhas/códigos/mensagens em TYPECHECK_DIAGNOSTICS.txt; hashes em TYPECHECK_BASE_COMPARISON.json. Não foi corrigido teste fora do escopo. Fontes de produção continuam PASS. Os6 testes nomeados do helper/cliente passaram (5 reexecutados por afetarem o contrato e1 novo); não contar wrapper TAP de arquivo como seis casos. O comando reproduzido diretamente sem --test registra os seis subtestes individuais.

Reutilizadas as9 provas PG,21 HTTP,27 upsert,2 contratos e3 classificações de eventos no alcance válido; sem rodar suítes backend/Prisma42 ou builds novamente. O navegador agora complementa, não substitui, as provas de concorrência/commit incerto/isolamento. As falhas intermediárias de inicialização do harness (rota não descoberta por symlink, rótulo de botão/escape de script e prioridade sessionStorage da fixture) foram corrigidas no ambiente de teste; seus registros privados foram preservados. Não foram falhas produtivas nem novas admissões/replays.

## Estado final e limites

Navegador e servidores Next/API/PostgreSQL locais encerrados após SELECTs; artefatos sintéticos/evidências retidos para revisão. Restore certificado de cifragem intocado. Nenhum deploy, VPS, reimportação real, reparo histórico, migration, .env ou retenção. NEWauth+NEWDB+NEWcipher, crons, guarda38 e out.15 CLOSED preservados. Segurança externa continua OPEN/rotações adiadas por aceite, revisão21/10 ou gatilhos. Falta decisão própria e preparação operacional coordenada antes de qualquer publicação produtiva. Referência desconhecida sem prova de admissão permanece dependência de inspeção explícita, não botão de descartar e tentar novamente.
