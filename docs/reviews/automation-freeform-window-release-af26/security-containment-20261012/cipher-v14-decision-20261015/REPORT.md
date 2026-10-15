# v14 — requisitos finais para decisão, 15/10/2026

**PREPARAÇÃO TÉCNICA CERTIFICADA PARA REVISÃO / NOT INSTALLED / NOT DEPLOYED.** Owner disponível agora com sudo, porém **possível uso humano**, conforme sua declaração. Não há autorização de A/B, admissão, contenção, SQL mutável ou partidas. Decisão explícita sobre a interrupção API/mesmo worker e impacto no uso humano permanece necessária; frontend será preservado. Nenhuma ausência de uso foi presumida.

[Certificado sanitizado](PROOFS_SANITIZED.json) e [blocos exatos A/admissão/B/C/C1/C2/D para decisão](COMMANDS_FOR_REVIEW.txt). A geração continua v14, sem extração na VPS, replay de renovação consumida ou alteração de bindings.

| Requisito | Prova atual e limite |
| --- | --- |
| Backup/RPO | Captura real11:27:42Fortaleza sob backup.lock,41.742.521B; válido estritamente até12:27:42. Ainda válido: NÃO repetido. Dump b049b2c6dc00db68070a4c46665a0b4a769161ba32d926b1cdd9239886791161. |
| Custódia/restore | Hash/bytes do dump off-host conferidos novamente; certificado retido/parado reutilizado, schema/fronteira idênticos, temporaryDatabaseRemoved=false. Nenhum restore/conversão/build repetido. |
| Root/writers | Captura owner12:00:26,10 controles/6 referências cron, desconhecidos0/incompletudes0; fonte15b/helper/regra/cadeias PASS. Frescor estrito até12:10:26. Não comprova saída futura. |
| Quatro modos/consumidores | Checker concreto e fontes/147/perfis/NEWauth+NEWDB PASS na cadeia real12:00:00. Os quatro bindings, manifests e review continuam iguais. |
| Capacidade/WAL | Mínimo deploy/PostgreSQL18.055.184.384B; piso8.794.603.520B; WAL288MiB às12:00 (352MiB às11:44). Amostras, sem extrapolar crescimento/garantir o futuro. |
| Controles/produção | Ambos crons before separados, saved/fallback600, identidades, guard/supervisão, SQL/proxy/healthDB PASS; guard38fechada/out15CLOSED conforme baselines congeladas. |
| Bytes atuais |262 arquivos integralmente comparados à cópia inativa entregue. Dois journals permitem só append read-only canônico/prefixo exato; quatro stderr vazios certificados. |
| Execução | Cinco gatesfalse/execfalse, selagem vazia. Instalação/inspect novo, admissão, fence/saída/ownership, CAS/commit/VERIFIED/starts e aceite posterior NÃO EXECUTADOS. |

Arquivo atual **9ff98e9b20b472f346dc51d16250939cb918ee8fd8cc5818a504a1249072d725**, alterado exclusivamente pelos novos registros/diagnósticos de leitura. Revisão **c6c0eaab668c199d8ab8705ff9457776cebfea683efaa3941437ae2d624a5fe5**, índice **fedc0612434754a437a9528fb06c8742f20d973733c3119397ed968c3c4d3d05**, política proposta **fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251** e instalador **b3d242fc92ccf60275ec0f875e5c2530f565981519e0d243b4fb8035eae9376f** preservados. Nenhum contrato/runtime/SQL/grant/plano/cifra alterado. Certificação12:01:10Fortaleza corresponde aos bytes atuais; antigo arquivo6fc/provas de8a963f43 intactos.

Renovada somente a captura root vencida; a cadeia atual READ ONLY reconfirmou os requisitos voláteis. Backup/RPO/custódia/restore ainda válidos foram reutilizados, sem repetir o apply de renovação. Se a decisão ocorrer após os limites acima, renovar apenas o vencido pelo procedimento canônico e recertificar/publicar qualquer hash alterado; não instalar nem adaptar inputs vencidos. Não há extensão tácita de prazo.

O certificador desta revisão apenas permite indicar separadamente a pasta da captura root nova e a custódia anterior do backup, evitando duplicar um dump válido. Mesmas validações integrais executadas contra tar/arquivos reais; índice integral externo novo preservado. Custódia privada permanente owner-accessível fora da VPS; não equivale a réplica física independente. A cópia local do tar serve à certificação/custódia dos diagnósticos atuais; não é rebuild ou nova extração produtiva.

Prisma permanece **LOCAL VALIDATED / NOT DEPLOYED**,42 testes/typecheck já concluídos, sem repetição. Não integra este pacote; sem.env ou reabilitação de retenção. Cron recuperado, auth/banco/console concluídos; NEWauth+NEWDB/out.15CLOSED/guarda38 preservados. Segurança externa/cifragem OPEN; risco residual segredo+ciphertext histórico continua acompanhado. Telegram opaco sem ativação e147grant imutável preservados.

Responsável Deifson; última revisão15/10/próxima21/10, antecipar após mudança/janela. Próxima ação concreta: decisão explícita de instalação/execução e de impacto no possível uso humano, dentro do frescor ou após sua renovação pertinente. Nenhum A/B foi autorizado ou executado nesta tarefa.
