# Matriz de validação e efeitos não exercitados

| Consumidor real | Arquivos/prova | Resultado e limite |
|---|---|---|
| Preparador/retention coordinator | captura atual, perfis aprovados, código/runtime por hash; ciclo de vida e orçamento antes da cópia | Local PASS; nenhum build funcional |
| Checker/shared contract |171 arquivos completos,4 modos/plan.mode/refs não vazias/permissões/ecosystems/restore | Local e VPS real PASS; nenhuma instalação |
| Operations.stop/start | código dos quatro modos, restore completo retido, árvore/owner/ordem/certificados/epoch |45 casos locais incluem contratos e negativas; efeitos OS simulados |
| Sequencer.close_then_preflight/finish | arquivos concretos e dois crons independentes | Local PASS4modos; protocolo root e HTTP são efeitos simulados |
| openai_cli.execute/recover | funções exatas, Operations/Sequencer reais |6 casos locais PASS; efeitos OS/provider e admissão injetados, não autoridade produtiva |
| admit_gates | código exato; faltas/RPO/root/provider target |5 casos locais PASS; relógio/observações externos injetados. ZERO gates produtivos admitidos |
| provider_probe | OpenAIBrain e transcribeWithOpenAi compilados, hashes iguais ao inventário ativo |3 casos locais PASS com HTTP interceptado e rede proibida. Não comprova chave/limites/faturamento |
| check_current | scripts/bindings SQL SELECT/guard/profile/PM2/saved/proxy/health/crons/capacidade | VPS17:19:55Fortaleza PASS; health isoladamente não é funcional |
| root_readonly/instalador | fontefa/helper8de/rule62b e parent chains | Preparados; NÃO executados. Root precisa ser fresco<600s no pré-A |
| Backup/restore refresh | procedimento backup.lock reutilizado + updater puro;4 proof bindings | Composição do updater puro4 casos locais PASS com relógio injetado; renovação NÃO executada. Restore retido permanece false para remoção |
| Provedor real/aceite | P0 e prova posterior sintéticos; owner UI | NÃO executados; autorização futura necessária, sem mensagem WhatsApp |

Nenhuma linha desta matriz autoriza inferir ausência futura de erro, parada efetiva ou limites de conta. As15 provas anteriores não foram reconstruídas por rotina. Drafts de engenharia v1/v2 locais preservados; v3 e v4 receberam staging inativo; v3 preservada/superada antes de publicação. V14/auth/banco não foram reutilizados como executores de janela.
