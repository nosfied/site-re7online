# Auditoria dirigida da barreira DB no start do worker — 02/10/2026

**V2 BLOCKED BEFORE REMOTE PREPARATION.** O patch publicado em `b8ae27c7` não permite completar a sequência API → worker quando a API sucessora mantém conexões normais com PostgreSQL. Nenhum script operacional foi alterado nesta auditoria; não houve acesso à produção, nova janela, contenção ou troca.

## Consulta e critério efetivos

`System.db_zero()` em `ops.py` usa `psql` para executar, no banco selecionado:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT json_build_object(
  'otherClientBackends', (
    SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND backend_type = 'client backend'
      AND pid <> pg_backend_pid()
  ),
  'advisoryLocks', (
    SELECT count(*) FROM pg_locks
    WHERE locktype = 'advisory'
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
  )
);
ROLLBACK;
```

Tanto `Operations.start()` quanto `reconfirm_for_renewal()` exigem literalmente `{'otherClientBackends': 0, 'advisoryLocks': 0}` para API e worker. O mesmo par de arquivos/hashes é usado nos modos `switch`, `return`, `return-partial` e `return-front-missing`: `ops.py` `513a458e6409d8f62669185833a61657cb561f2f62ed6f0ff4539eaf01fd2f65`; `delegated.py` `6d9ca0273af34a105ea8bb9f156914b5ed422287a557f87d88bfa50415d80877`. A consulta exclui apenas o próprio backend de `psql`; **não identifica nem exclui a API sucessora**. O papel de banco e `application_name` também não comprovam propriedade de uma conexão.

## Prova comportamental isolada

Foi clonado um banco **local sintético** em PostgreSQL `127.0.0.1:55432`. Uma API compilada existente do worktree iniciou em Node 20 com o banco isolado, sem credenciais de provider e com schedulers, IA e outbound desabilitados. O bootstrap DB passou. Enquanto essa API estava ativa, a consulta **real** de `System.db_zero()` retornou `otherClientBackends=2`, `advisoryLocks=0`. A leitura de `pg_stat_activity.client_port` correspondeu às duas conexões TCP pertencentes ao **mesmo PID Node da API** na leitura local de `ss -tnp`. O vínculo socket→PID foi observado no host de teste; não é inferido de usuário, nome da aplicação ou mera contagem SQL.

Dois testes dirigidos usaram a consulta real e os `Operations.start()`/`reconfirm_for_renewal()` V2 nos cenários de implantação e retorno. Ambos passaram **porque confirmaram o bloqueio**: `unknown_db_owner` antes do start do worker, sem novo `start-intent`, processo worker ou request de renovação. Os 78 testes anteriores e os dois cenários de relógio usavam um `Fake.db_zero()` inicializado em zero; suas injeções de valor positivo testavam rejeição, mas não modelavam a API sucessora conectada após o primeiro start. Nenhum teste/build amplo foi repetido. O banco descartável foi removido após a prova e a API local encerrada; nenhuma sessão/provider produtivo participou.

O build usado para manter uma conexão real foi o compilado local já existente, **não** o candidato remoto af26. A incompatibilidade decorre da consulta SQL e da ordem de execução iguais nos quatro modos; a prova não valida uma correção futura nem atribui conexões do ambiente alvo.

## Decisão técnica necessária antes de corrigir

Não excluir conexões por papel, host, `application_name` ou prefixo genérico: isso aceitaria terceiros e não provaria um único proprietário. O menor ajuste seguro precisa separar, no gate do worker, as conexões comprovadamente pertencentes à **API sucessora exata** das demais. Isso requer vincular cada backend observado ao socket do processo API de PID **e tempo de início** já verificados, confrontando endereço/porta do cliente com o descritor/socket no host e mantendo rejeição de backend sem vínculo, outro cliente e advisory lock. A checagem deve ocorrer na renovação e novamente imediatamente antes do start, preservando as verificações de composição, certificado, descendentes, sockets antigos e contenção. É necessário ensaiar churn do pool, API reiniciada/PID reutilizado, terceiro concorrente, retorno e falha de atribuição. Se a topologia real usar proxy, NAT ou outro host e impedir esse vínculo, esta alternativa não pode ser presumida; a janela permanece bloqueada até haver outro mecanismo verificável de propriedade.

O zero global ainda é válido **antes do primeiro start da API**. Após esse start, ele é incompatível com a própria API conectada. A release af26 e o pacote V2 permanecem **NOT DEPLOYED**. Builds e evidências anteriores continuam preservados; nenhum rollback, provider call ou envio ocorreu.

Correção local posterior: [gate V3 e ensaio dirigido](OPERATIONAL_DB_OWNER_V3_LOCAL_2026-10-02.md). Este relatório preserva a constatação original do V2; V3 ainda não foi preparado remotamente nem implantado.
