# Campo de horário — auditoria dirigida, 07/10/2026

**Registro da auditoria anterior à correção.** A correção local posterior está registrada em [relatório final](CAMPAIGN_SCHEDULE_AND_GROUPS_LOCAL_2026-10-07.md), sem deploy. **Estado no momento da auditoria: DEFECT CONFIRMED / AUDIT ONLY.** Relato owner: tenta14h e campo volta15h. Consultados código atual e versão frontend9f implantada, gitblame, leitura dirigida do banco e reprodução isolada do corpo efetivo do efeito. Nenhum agendamento alterado, cancelado ou enviado pelo Codex; sem build/deploy/reparo.

`src/app/app/campaigns/page.tsx:1733` useEffect depende do objeto selectedCampaign. Reidrata scheduleInput com `new Date(selectedCampaign.scheduledAt).toISOString().slice(0,16)` a cada nova resposta de detalhe. ISO produzUTC; datetime-local exige hora civil local sem offset. O mesmo estado scheduleInput é usado pelo composer dinâmico e agendamento do detalhe. Polling3s em9f atualiza selectedCampaign e, se existe scheduledAt, sobrescreve edição/composição independente. Handler interpreta novamente o texto local com newDate e toISOString; salvar valor reposto pode deslocar o instante. Não é demonstração de scheduler adicionando uma hora.

Gitblame: conversãoUTC vem de6c3d4c15, dependência pelo objeto de f96a69cc;9f4cbe0f acrescenta refreshCampaignDetail no polling. Defeito de conversão preexistente; nova atualização periódica pode torná-lo repetitivo. Não atribuir todo o problema a novo backend ou fuso do banco.

Leitura11:56:41Fortaleza: `Campanha teste out.12`, scheduled, created11:38:53, scheduledAt15:40UTC/**12:40Fortaleza**. Esse instante não é14hFortaleza. Owner alertado para não confirmar campo divergente e usar ação da interface para impedir envio se horário não intencional; nenhuma alteração executada pelo assistente. Não foi auditado público/variáveis dessa campanha nem autorizado seu envio como nova prova.

Reprodução isolada, America/Fortaleza, Node22.13.0: corpo efetivo do efeito extraído e executado com setters de estado no harness. scheduledAt15:40Z equivale12:40local; campo recebe15:40. Usuário edita14:00; objeto novo de detalhe com mesmo scheduledAt repõe15:40. Se submetido novamente como hora local, iria18:40Z. AssertionsPASS. Não é smoke de navegador/React completo nem compiladosNode20. Falha inicial do harness por return fora de função foi corrigida envolvendo callback; não é defeito da aplicação. Evidência privada foraGit.

Correção mínima proposta, ainda não implementada nesta auditoria: converter timestamp salvo para componentes locais; inicializar edição por identidade/contexto de campanha e preservar alteração do usuário durante polling; separar composer de detalhe se necessário para impedir influência de seleção anterior; limpar campo corretamente na troca. Testar detalhe selecionado anterior, criação dinâmica nova, timezoneFortaleza, polling com mesmo horário e troca de campanha/resposta tardia. Não alterar scheduler, horário persistido, schema ou status para resolver UI.

Correlação exata do relato (antes de confirmar, nova campanha versus detalhe) solicitada ao owner; diagnóstico do código é confirmado, associação completa da interação permanece pendente. Aceitesout.10/out.11 preservados com horários persistidos e submissões reais conferidos.


## Seleção automática após reload — esclarecimento do owner

Owner relata persistência após recarregar/navegarInbox e voltar diretamente ao composer. Confirmado no código: `refreshCampaigns` usa `selectedIdRef.current ?? response.items[0]?.id`, selecionando automaticamente o primeiro resultado mesmo sem clique no detalhe. Efeito por selectedCampaignId chama refreshCampaignDetail independente de detailModalOpen; o objeto carregado aciona reidrataçãoUTC do mesmo scheduleInput do composer. Assim o defeito não exige seleção manual nem modal aberto. Reload limpa memória, mas a listagem refaz a seleção e repõe o horário do registro agendado. Explicação anterior restrita à seleção pelo usuário era incompleta.

Cadeia: carregamento→listagem→seleção automática→detalhe embackground→scheduleInput compartilhado/preenchidoUTC→polling sobrescrevendo edição. Campos de composer devem ser independentes do detalhe e preservados durante refrescos. Sem alteração funcional ou mutação produtiva nesta extensão da auditoria.
