# Exposição de configuração — ocorrência separada, acompanhamento aberto

**Continuidade preparada:** [inventário, propostas privadas, autenticação V4, banco, cifragem, permissões e comandos](../../security-containment-20261012/README.md). Campanha permanece encerrada; segurança aberta. A auditoria inicial abaixo é histórica e seus limites permanecem.

## Evidência e alcance

Durante a janela anterior, uma leitura não estruturada de JSON privado em linha única fez aparecer configuração sensível no output de uma ferramenta da sessão do agente. Isso foi reconhecido pelo operador e consta do relatório a87d4f4a. Não foi publicação no Git; **não equivale a contenção nem invalidação das credenciais**. Não há prova suficiente aqui para reconstruir exatamente o trecho truncado exibido, quem acessou/exportou o transcript, sua retenção ou todas as cópias. Não declarar ausência de acesso indevido ou retirar registros históricos para presumir contenção.

Leitura delimitada de 12/10/2026 às 19:54:34 UTC / 16:54:34 Fortaleza comparou em memória a configuração preparada com a API ativa, emitindo apenas categorias e contagens: credencial de banco (1), assinatura de sessão (1), chaves de dados cifrados (3), autenticação de providers (7) e autenticação interna de controle (2). Todos esses valores configurados coincidem com os da API viva. Essa igualdade significa que continuam sendo usados/configurados; não prova validade externa, escopo ou expiração de tokens. Nenhum provider foi consultado. As categorias são o universo potencial daquela configuração; a visibilidade individual no output histórico não foi reconstruída.

Arquivos: configuração preparada mode600/owner deploy; PM2 saved mode664/owner deploy e fallback mode600/owner deploy. O mode664 merece revisão própria juntamente com acesso aos diretórios/grupos; isoladamente não comprova que terceiros conseguiram lê-lo. Não houve chmod nem retirada nesta tarefa. Evidências locais de auditoria e dump mantidos em diretório700/arquivos600, sem raw secrets no relatório/Git. A primeira leitura de categorias negou por PM2 ausente no PATH do SSH; recusa preservada. Nova leitura usou o caminho canônico, sem alterar credenciais ou excluir processos.

## Mecanismo de saída corrigido

`private_command_capture.py` grava stdout/stderr integralmente em arquivos privados novos, conserva exit code/timeout e emite apenas metadados fixos (tamanho, hash, duração). Não imprime comando, argumentos, ambiente ou conteúdo, não sobrescreve recibos e não faz retry. Testes locais com segredo sintético em stdout/stderr e exit7: nenhuma reprodução no output; resultado e bytes privados preservados; colisão de nome e diretório de permissões inválidas negados. O coletor de categorias usa allowlist explícita e projeção agregada em memória. Proibida leitura `cat`, `rg`, `sed` ou dump bruto de configurações privadas para o output de ferramentas. Isso evita repetição; não remove a exposição passada. Nenhum mecanismo foi instalado como helper/root ou alterou a aplicação.

## Necessidade e plano de rotação para decisão

Recomenda-se tratar os valores potencialmente expostos ainda configurados como comprometidos até avaliação do owner sobre acesso ao transcript. Prioridade imediata para credenciais com acesso externo e assinatura/autorização; nenhuma rotação está executada nem implicitamente autorizada por este relatório.

| Categoria | Ação concreta futura | Impacto e pré-condições |
|---|---|---|
| Providers | Owner inventaria cada credencial, emissor, escopo, validade e dependentes; emite substituta pelo console oficial, prepara configurações em custódia privada, valida acesso sem envio e revoga a anterior após troca coordenada. | Pode interromper Meta/Instagram/IA ou validação de webhook se revogada antes de atualizar todos os consumidores. Não produzir mensagens como teste. Validade/escopo externos ainda desconhecidos. |
| Sessão/autorização | Gerar novos segredos fora de logs, preparar API/worker/controles e referências; substituir em janela própria, com decisão sobre revogação de sessões. | O contrato `clientAuth.ts` verifica HMAC com uma única chave; tokens antigos deixam de validar ao trocar a chave. TTL canônico de sessão é 12h, mas esperar TTL não elimina risco de forja por chave exposta. ADMIN/control também precisam atualização coordenada. |
| Banco | Preparar nova senha da role e atualizar todos os consumidores: API/worker, backup/cron, drivers e saved/fallback. Executar ALTER ROLE somente em tarefa explicitamente autorizada, com rollback e conferência de novas conexões. | Conexões já abertas podem continuar; pools/reconnect/backup falham se configuração e role divergirem. Não confundir senha alterada com todas as sessões SQL revogadas. |
| Chaves de cifragem | Inventariar registros/ciphertexts e leitores; manter chave antiga em custódia restrita, implementar/ensaiar recriptografia reversível e conferência antes da troca. | `channelAccountSecretCrypto.ts` usa AES-GCM com chave única e prefixo v1; substituição cega perde leitura de credenciais cifradas. MFA/webhooks também exigem inventário e plano específico; não há key-ring comprovado. Backups históricos dependem da chave antiga. Não trocar por rotina. |
| PM2/controle interno | Preparar configurações novas, manifests/bindings e saved/fallback para todas as dependências; atualizar tokens de controle em ambas as pontas. | Não alterar dumps/configuração manualmente nesta etapa. Hashes/políticas e controles operacionais devem ser reconferidos; nenhuma mudança silenciosa para obter PASS. |

Aprovação requerida para execução de cada rotação e seus impactos; o plano atual não inclui restart/deploy, revogação, chmod, remoção de transcript ou de evidências. Owner deve avaliar acesso/compartilhamento do registro da ferramenta, retenção/exportações e possibilidade de restrição/remoção por controles do produto, sem assumir que o agente possa apagar o histórico remotamente. Preservar provas com acesso mínimo; não anexar JSON privado neste chat.

## Critério de fechamento da ocorrência

Inventário/escopo/validade confirmados; valores potencialmente expostos revogados ou justificativa de risco aprovada; novos leitores e sessões/serviços verificados; ciphertexts/backups recuperáveis; custódia/acesso ao transcript avaliados; resultado documentado sem valores. Até lá, **SECURITY FOLLOW-UP OPEN**, independente de qualquer encerramento da campanha.
