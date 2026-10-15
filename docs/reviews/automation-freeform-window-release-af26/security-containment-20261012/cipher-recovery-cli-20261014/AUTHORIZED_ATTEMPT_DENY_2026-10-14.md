# Resultado da tentativa autorizada v9 — 14/10/2026 Fortaleza

**DENY / PREFLIGHT BLOCKED / NOT INSTALLED / NOT DEPLOYED.** A autorização e a disponibilidade sudo do owner foram confirmadas. A0 transferiu somente o pacote privado7ad30d08, verificou manifestf377d644 e fez extração nova. O checker integral do pacote, runtime e quatro modos passou. A reconferência operacional fresca recusou **antes de instalação ou contenção**, na etapa `CipherConsumers.verify('before')`.

## Causa efetiva

`cipher-consumers.private.json` contém três entradas `immutable` sem o campo **mode**. O consumidor selado exige `safe_file(e['path'], e['uid'], e['mode'])`. A avaliação de `e['mode']` produz `KeyError` antes da leitura dessa referência. O preparador original montou referências com path/uid/sha256 e não incluiu mode; a v9 reutilizou esse contrato incompleto.

A mesma exceção `KeyError('mode')` foi reproduzida localmente com os bytes reais do input v9 e o verificador canônico, sem alterar o input. É defeito da preparação que publicamos, **não evidência de drift produtivo**, nem erro de credencial/cifragem. As provas CLI anteriores usavam referências imutáveis vazias na fixture e não cobriram essa composição concreta; o checker do pacote valida hashes/configs, mas não executa essa conferência completa dos consumidores. A0 PASS não substitui elegibilidade operacional.

Não adicionamos campos, alteramos bindings/manifests ou repetimos a conferência para obter PASS. A geração v9, o pacote e a negativa permanecem preservados. Não usar v7 como alternativa.

## Alcance das conferências e tempo real

- Primeira leitura: **15/10 01:49:06 UTC / 14/10 22:49:06 Fortaleza**. Disco raiz disponível18.439.319.552 B; essa leitura deploy isolada não certifica o mínimo deploy/PostgreSQL nem WAL.
- Transferência/extracão novas, SHA do pacote/manifest, onze entradas do review manifest e checker runtime/quatro modos PASS.
- Antes da recusa: nomes/identidades/configuração da API410272, worker410428 e frontend188897, saved/fallback600 e conteúdo correspondente, guarda38 fechada, cinco gatesfalse e diretório de selagem vazio passaram.
- **Scope atual/147, inventário SQL/proxy, mínimo deploy/PostgreSQL, WAL, backup/RPO/custódia renovados e hashes root de instalação não foram alcançados.** Não são declarados PASS nesta tentativa. Backup/restore/provas válidas anteriores permanecem históricos, sem captura nova.
- Inspeção posterior: **15/10 01:52:07.517656 UTC / 14/10 22:52:07.517656 Fortaleza**: identidades API/worker/frontend iguais, health/DB PASS, guarda38 fechada, gatesfalse, selagem vazia e nenhum intent/recibo/baseline de execução ou recuperação.

O intervalo medido entre primeira leitura e inspeção posterior foi **aproximadamente181,5 s** (a primeira leitura tem precisão de segundos); inclui transporte e conferências, não uma interrupção produtiva. **A/B não iniciados; interrupção causada pela tarefa: zero.** Não houve stop/start, instalação de política/helper/sudoers, mutação SQL, troca de chave, desconexão Web, teste por envio ou abertura da guarda. Out.15 não foi modificada; seu encerramento permanece registrado. Não reabrimos sua auditoria.

## Custódia e próxima ação

Negativa e inspeção posterior copiadas privadamente, com hashes conferidos, para o cofre700/arquivos600 do owner em `cipher-recovery-v9-20261014/authorized-denial-20261015`. Valores/configs não publicados. Pacote e geração original não foram sobrescritos.

Próxima ação executável de engenharia: nova preparação revisável que capture **modo efetivo, proprietário, tipo e hash** das três referências, valide o contrato completo e ensaie `CipherConsumers.verify` com referências reais equivalentes não vazias. Acrescentar negativa para modo ausente/divergente antes de transferência/instalação. Preservar v9 DENY; não corrigir seu input selado em campo. Reutilizar runtime/grant/snapshot/restore/SQL/CLI não afetados. Nova geração, política/installer/manifests e revisão explícita precedem qualquer reabertura da janela.

A autorização desta janela foi bloqueada por sua própria condição de recusa na conferência inativa. Nenhuma recuperação C1/C2 aplicável: não houve plano final/commit/start. NEWauth+NEWDB, console, frontend, out.15 CLOSED e guarda38 permanecem preservados. Segurança externa/cifragem e risco segredo+ciphertexts históricos continuam **OPEN**; propostas.env e credenciais externas não aplicadas.

Responsável: Deifson Oliveira. Revisão14/10; próxima21/10, antecipada após correção/janela.
