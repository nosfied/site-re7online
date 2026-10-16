**Histórico preservado: [recuperação original concluída posteriormente](../crm-csv-original-recovery-20261016/RECOVERY_COMPLETE.md). O estado parado descrito abaixo foi resolvido sem implantação CSV.**

# CSV — execução interrompida / recuperação depende de revisão

**DENY / STOPPED_UNSELECTED —08h02min10s Fortaleza. API/worker parados, contenção global presente, frontend preservado. Não repetir A/B.** [Evidência sanitizada](EXECUTION_DENY_SANITIZED.json).

Autorização48acbe65…, review56965c12…. A passou; admissão canônica FIVE_GATES_ADMITTED às08h01min45s e captura before PASS às08h01min46s. Root/RPO estavam válidos. B foi executado uma vez,22,919s, exit1 às08h02min09s. C foi executado uma vez, exit0: `STOPPED_UNSELECTED`, sem replay autorizado. A duração de B não representa medição contínua de HTTP ou duração final de indisponibilidade.

## Falha e alcance

A sequência chegou a contain/stop-pair e certificado de saída. Inspeções posteriores confirmaram fence, ausência de API/worker, somente frontend vivo e recibo de importações válido. Não houve intent do overlay Event, seleção de candidata, start-intent/started de qualquer modo ou certificado de conclusão.

O próximo consumidor, `event_overlay.apply`, exige toda a cadeia sem escrita de grupo (`event_source_parent`). Cinco diretórios existentes sob `/opt/re7online/site-re7online` até `src/events` estão775. Conferiram consumidores Event, fonte/alvo/hash, tipo/owner/modo do arquivo e ausência de xattrs. A rejeição é da cadeia dos diretórios, não dos bytes. Nenhum chmod, overlay, env ou credencial foi aplicado.

**Causa de escape:** pacote/checker/pre_install validavam arquivo e referências Event; o predicado adicional de pais era exercido somente no apply após a parada. As provas anteriores não certificaram esse predicado sobre a cadeia real. A responsabilidade é da preparação; não atribuir a mudanças produtivas sem evidência.

## Estado preservado e bloqueio de recuperação

Cinco gates e execution-authorized permanecem true, como admitidos; não foram zerados para simular encerramento. Ambos os crons estão no estado contido, ainda aguardando recuperação. Guarda38 fechada; baseline de out.15 e todos os materiais NEWauth+NEWDB+NEWcipher preservados. Não há aceite de telas/health final porque API está parada. Segurança externa permanece OPEN.

O texto `backendReturn=PRESTOP_ONLY` da inspeção não torna PRESTOP aplicável: o CLI só admite PRESTOP na classificação PRESTOP; `STOPPED_UNSELECTED` corresponde a CANDIDATE no mapa real. Contudo CANDIDATE reaplica o mesmo overlay e negaria novamente por775. **Não executar nenhum desses caminhos como solução pronta.** Não houve recuperação automática nem repetição de SQL/start/import.

Próximo trabalho para decisão explícita: preparar recuperação nova, selada e verificável que resolva o contrato de diretórios Event antes de qualquer efeito, preserve identidades/conteúdo/permissões e permita prosseguir exclusivamente com backend compatível. Não editar geração/inputs/manifests consumidos, não restaurar backend antigo, não fazer chmod produtivo por conveniência. Retomar atendimento exige uma decisão de recuperação; não é autorizado pelo diagnóstico.

Intent/journal/recibos/baseline/diagnósticos preservados em arquivo privado off-host, SHA2e1baf84…. O estado original de recusa e o staging anterior permanecem. Nenhuma fronteira frontend foi materializada, pois a API não concluiu.
