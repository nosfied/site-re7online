# Estado → decisão → modo → política (futuro, local)

Nenhuma linha autoriza efeito produtivo. Recuperação reclassifica sob locks global/sequencer.

| Estado/prova | Opção explícita | Modo | Política/ação root | Limite |
| --- | --- | --- | --- | --- |
| PRESTOP: três processos originais com PID/ticks/config atestados; sem saída/seleção/start candidato | PRESTOP | prestop, sem start | fonte atual; abort-prestop | crons desconhecidos/identidades divergentes negam; fechamento técnico obrigatório |
| STOPPED_UNSELECTED: saída/árvores/sockets/DB zero/restore/inventário/no-new-admission; sem overlay/seleção/start | ORIGINAL | return-before-commit | proposta original-only; authorize-return → root mode return | perfil/mapa/código original e política correspondente; não depende do overlay ou binding candidato |
| Seleção confirmada; nenhum candidato vivo ou apenas API conhecida/atestada | CANDIDATE | return-partial | targetProcesses.return candidato; authorize-return | nunca original; população/identidades incertas negam |
| Seleção confirmada; API+worker candidatos conhecidos, markers correspondentes | CANDIDATE | return | targetProcesses.return candidato; authorize-return | preserva backend/ledger/GET; defeito persistente requer versão compatível nova |
| Intent de seleção sem recibo; overlay pré-seleção; possível start sem seleção comprovada | nenhuma | nenhum | nenhuma ação | UNCERTAIN_SELECTION; não inferir rollback/ausência de escrita |
| Start-intent sem started correspondente em qualquer modo | nenhuma | nenhum | nenhuma ação | UNCERTAIN_START; resposta perdida não permite replay |
| Marker de start sem intent | nenhuma | nenhum | nenhuma ação | UNPROVEN_START |
| Saída ausente e par não corresponde ao original | DENY | nenhum | nenhuma ação | não apresentar PRESTOP_ONLY nem presumir par vivo |
| Recovery intent existente | nenhuma | nenhum | nenhuma ação | RECOVERY_CONSUMED; informa recibo e starts sem ack; sem replay |
| Recibo sem intent ou conclusão anterior | nenhuma | nenhum | nenhuma ação | inconsistência/consumo; inspeção e decisão fora deste fluxo |

Perda de resposta depois de start, abort-prestop, liberação ou restauração mantém intent; não gera recibo de sucesso automático. Nenhum replay ou recuperação automática.

Return-before-commit mantém fonte=destino=perfil original pós-auth/banco/cifragem. Demais relações são as canônicas CSV; profile_delta proíbe alteração de env/credenciais e worker/frontend. O helper continua com schema switch/return; a proposta altera só targetProcesses.return para os dois runtimes originais e exige revisão/fase fenced fresca. Dispatcher original permite apenas recover-partial, starts API/worker, unfence, verify-unfenced e restore-controls. Nenhum instalador ou ação privilegiada novo.
