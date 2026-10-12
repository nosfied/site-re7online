# Preparação de contenção de credenciais — 12/10/2026

**SECURITY OPEN / PREPARED FOR REVIEW; NOT ROTATED, NOT REVOKED, NOT RESTARTED.** Out.15 permanece CLOSED no alcance de 2e8dc9ea, sem aceite retroativo da audiência; guarda38 fechada. [Comandos e fases](COMMANDS_FOR_REVIEW.txt), [resultados/hashes](RESULT.sanitized.json), [políticas/limites da primeira fase](AUTH_V4_FOR_REVIEW.md) e [matriz de cifragem](CIPHER_RECOVERY_FOR_REVIEW.md). Nenhuma nova investigação de audiência, envio ou cancelamento.

## Inventário e dependências reais

Inventário privado inclui os **14 slots, 13 valores distintos**, fontes atestadas, consumidores, emissores/ativos candidatos, escopos conhecidos e mecanismo de substituição/revogação. Não exportado ao Git. A duplicação entre dois slots externos não prova que pertençam ao mesmo app: owner deve confirmar ativo/emissor nos consoles antes de sincronizar substitutas. Campos de issuer/escopo/expiração externos desconhecidos estão marcados pendentes; não inferidos por formato do token. Isso não impede gerar propostas e preparar a fase local de autenticação.

| Categoria | Slots | Consumidores/alcance | Substituição e impacto |
|---|---:|---|---|
| Assinatura de sessão | 1 | API e worker; sessões app de todos os tenants | Troca coordenada; JWT antigo rejeitado. Logout esperado; novo login pela interface, usuários/senhas/RBAC preservados. |
| Autenticação interna | 2 | Administração global da API e controle API↔worker | Dois lados do controle precisam do mesmo valor novo, nunca vazio. API/tooling admin usam a proposta nova. Retorno operacional conserva as credenciais novas. |
| Credenciais externas | 5 | Apps Meta/OAuth/HMAC, fallback WhatsApp e projeto IA; emissores/ativos exatos em arquivo privado | Owner nos consoles Meta/OpenAI. Nenhuma criação/revogação feita aqui. Reset de app pode não permitir coexistência: registrar o efeito real e não retornar ao segredo revogado. |
| Estado OAuth/verificação | 2 | Assinatura state de login e desafio de webhook | Gerados localmente; state pendente deve reiniciar. Verificação exige sincronização com console Meta, sem mensagem/webhook sintético em produção. |
| Banco | 1 | API, worker, reconexões, backup local, ferramentas/admin, inicialização/restauração e PM2 | Role mantém privilégios; senha proposta diferente. Atualizar todos os consumidores e saved/fallback. Backup Docker atual usa conexão local trust; isso não prova nova senha TCP. |
| Cifragem | 3 | Segredos de canais/Web/Telegram, MFA e assinatura dos webhooks públicos; backups | Não substituir antes dos gates de leitura/recriptografia. A chave de canal também é o fallback de snapshots de campanha. |

Nenhuma réplica idêntica do admin global foi encontrada em tokens administrativos dos tenants; nenhum token de tenant Meta coincide com o fallback exposto. Isso **não** exclui dependência de outros tokens do mesmo app em um reset. Inventário delimitado dos dez tenants e nove contas, consultas READ ONLY com statement/lock timeout e limites explícitos; providers não consultados. A role da aplicação é superuser/createrole no retrato atual: alcance alto da credencial de banco. Não houve redução/ampliação de privilégios nesta tarefa; least privilege é decisão separada.

## Saída/custódia e permissões

Toda saída bruta nova foi capturada pelo capturador privado (stdout/stderr/code/timeout; sem retry), com resumo explícito por allowlist. Nenhum valor, cookie, token, comando com valor ou configuração privada no relatório/Git. Inventário e propostas locais: diretório700/arquivos600. Escrow cifrado dos 14 valores testou round-trip pelo cipher existente; chave de recuperação separada do arquivo cifrado e deve ser entregue ao cofre offline do owner. Isso não apaga nem contém retroativamente o output antigo: alcance/retensão/exportações do transcript permanecem desconhecidos.

Duas amostras POSIX/ACL/NSS foram completas e iguais: saved664, fallback600, home750, .pm2775; leitura efetiva pelos usuários/grupos observados restringe-se a deploy e root. Não comprova ausência de leitores privilegiados, backups ou futuro membro do grupo. Ajuste mínimo proposto: **somente os dois arquivos em600**, sem mudar ownership/diretórios/helper/sudoers. PM2 efetivo6.0.14 usa writeFileSync para saved/backup: preserva mode de arquivo existente; futuras criações devem usar umask077. Novo driver valida conteúdo/tipo/owner/modo antes de qualquer chmod; default READ ONLY. Não foi aplicado.

## Primeira fase concreta

Geração nova inativa na VPS: `incident-6683-v4-security-auth-v2-20261012T223100Z`. Mesmo candidato/retorno funcional já existente, sem cópia de build/dependências. Só três valores de autenticação mudam em API/worker; frontend e chaves de cifragem/banco/providers ficam iguais. Configurações integrais JSON↔ecosystem dos três modos validadas, baselines reais novas, root policy proposta, source IDs/ticks observados, 29 arquivos por modo, cinco gatesfalse/executionfalse. Nenhum intent/start/exit proof consumido foi copiado; recibo de cancelamento é evidência histórica durável, não prova de saída. Helpers/sudoers/políticas ativas intactos.

Política proposta `7234446434d016df8fca6b1d46ae071364fbdf944a0fcf0801d146abaa5a6a46`; instalador `188a588daf7b097836d4acb04171664951eb3ac6bd4cd9d991d953bfae447fca`. Originala2ff permanece instalado. Gates devem permanecer falsos até decisão de instalação/janela e pré-condições imediatas, incluindo backup/RPO/custódia atualizados. Essa geração é para **revisão da fase de autenticação**, não certificado de contenção completa dos14 nem autorização de execução.

Um primeiro preparador recusou colisão de arquivo regenerado; geração223000 incompleta e diagnósticos preservados, não instalada/usada. O gerador corrigido foi validado em cenário local de colisão/skip e produziu uma geração distinta223100. Nenhum binding da tentativa anterior foi adaptado. Package local inicial de composição preservado; versão2 corrige explicitamente a origem do switch. Não confundir esses diagnósticos de preparação com falha produtiva.

## Provas e limites

Node20.20.0: módulos canônicos de cifragem/session e controle HTTP do worker têm hashes iguais aos ativos. Round-trip das três famílias e das referências de identidade; chave errada/malformado negados. Sessão antiga rejeitada, nova válida. Worker HTTP real em loopback: token antigo/ausente401, novo health200, provider0. Bind local foi negado pelo sandbox; ensaio fora dele passou; recusa preservada. Sem restart produtivo.

PostgreSQL16 real isolado/SCRAM: senha antiga nega nova conexão TCP, senha nova aceita; conexão antiga já aberta continua viva. Role password via libpq oficial, SCRAM em arquivo privado sem plaintext na SQL/argv. Rollback da fixture preserva dados; CAS tenant/cipher impede cruzamento. Não é prova de aplicação SQL em produção. Primeira fixture misturou preparação e rollback na mesma mensagem SQL; diagnóstico preservado, corrigida em laboratório distinto.

Dump fresco anterior de hash a31b5a9f… restaurado exclusivamente em PostgreSQL local: os dez segredos de canal legíveis e341 referências foram lidos/round-tripped; linha Telegram inválida igual à origem faz o planner negar antes de gerar plano parcial. MFA0/webhook0: prova real de contagem, não recuperação de dados inexistentes. Banco temporário removido. Backups/recibos/históricos não reescritos.

O contrato local `credential_boundary.py` demonstra intent único → efeito → recibo verificado → sucessor; timeout/resultado desconhecido preserva intent e nega start/replay/retorno com credencial antiga. **É contrato de callback local, não adapter V4 produtivo certificado**. O adapter candidato `credential_sequencer.py` está implementado e validado por callbacks locais; a integração selada da fase banco/reset/recriptografia precisa de nova geração no ponto canônico após `verify_stopped` e antes de `start_pair`, sem alterar helper/sudoers ou contornar exit/drain/DB ownership. A fase auth pronta usa o sequenciador canônico sem esse hook.

## Pendências concretas para decisão consolidada

1. Aprovar instalação/janela da fase auth ou aguardar coordenação com externos. Logout explícito e parada API/mesmo worker; frontend preservado. Nenhuma exposição ao chat das propostas.
2. Owner confirma ativos/escopos/validade e substituição/revogação dos cinco slots externos nos consoles, preenche arquivo privado; schema nega campos vazios/valores antigos/falta de prova. Nenhuma necessidade de reconstruir o transcript inteiro.
3. Banco: adapter de commit/recibo antes de sucessor, configurações finais com senha nova, backup local/Docker/cron/initializer/ferramentas, saved/fallback. Não iniciar com URL antiga após SQL, não reativar senha exposta como retorno. Conexões antigas precisam drain comprovado.
4. Cifragem: disposição/reparo canônico específico da linha Telegram inválida e decisão sobre decoder histórico versionado dos147 campos de seed, preservando hashes/recibos. Não omitir linhas nem manter a chave exposta como chave de novos snapshots para obter PASS.
5. Derivados da chave de canal: quatro tokens Meta, um Telegram legível e cinco estados Web são recuperáveis do material cifrado com a chave antiga. Recriptografar não revoga esses tokens/estados nem elimina acesso a backups antigos. Rotação/recredenciamento derivado exige escopo/owner e pode demandar novo pareamento/desconexão dos cinco Web; não realizado/não autorizado por esta preparação.
6. Capacidade imediata/RPO antes de cada fase. Última amostra stage: min(deploy/PG)2.201.706.496B, piso2.131.755.008B, margem69.951.488B. Auth reutiliza releases e passa reserva de4MiB. Não declarar orçamento de cifragem/WAL PASS apenas por esse número; crescimento/WAL e planos finais precisam reconferência/medição. Sem limpeza ou expansão executada.

CampanhaCLOSED, segurançaOPEN e futura decisão de abertura da guarda são três frentes separadas. Nenhum envio, abertura, retomada, migração, rotação/revogação, chmod do PM2 ou controle de processo produtivo nesta tarefa.

## Fontes oficiais consultadas

OpenAI Docs confirmou gestão de permissões por projeto e exclusão da chave de projeto; o acesso real/escopo do owner permanece pendente. [RBAC oficial](https://developers.openai.com/api/docs/guides/rbac), [exclusão de chave](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys/methods/delete). Não foi emitida/chamada uma Admin API key nem realizada operação real.

PostgreSQL16 documenta ALTER ROLE e restrições do arquivo de senha. O driver usa libpq/SCRAM para não inserir plaintext na SQL e a prova TCP é separada do trust local. [ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html), [arquivo de senha](https://www.postgresql.org/docs/16/libpq-pgpass.html).

As páginas oficiais Meta de access tokens/basic settings não puderam ser obtidas nesta consulta. Não usei fontes secundárias para presumir reset/revogação/escopo: o roteiro exige a confirmação do efeito no console do ativo exato, em custódia privada.


Continuidade autorizada12/10: [bloqueio pré-instalação, efeitos reais e preparação restante](AUTH_EXECUTION_2026-10-12.md). Esse resultado substitui o estado corrente anterior; hashes/históricos preservados.
