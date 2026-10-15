# Consumidores e provas dirigidas

| Consumidor real | Precondição/pós-condição nova | Prova executada | Efeito produtivo não exercitado |
|---|---|---|---|
|Sequencer.recover(prestop)|identidade original → ambos crons conhecidos → helper root → deploy before → ambos before → sucesso|método inteiro, estados mistos/before/window, terceiro estado, falhas root/install, resposta perdida/readback; sem journal falso|helper root, crontab real, guarda HTTP|
|Sequencer.close_then_preflight|ambos before antes de fechar guarda|cada cron divergente nega antes do efeito|fechamento/nonce/saída de writers|
|read-preparatory.py + requisito conductor|gate scheduled_controls_before separado antes do checker|entrypoint real até checker estático preservado,5 combinações; conductor requer novo gate|demais estágios preservados não reexecutados nessa prova local; nenhuma admissão produtiva|
|DelegatedControls.prepare,4 modos|deploy e sistema before antes de instalar window|métodos reais, configs/fontes/prova restore completas, before válido e divergência de cada cron|instalação window/crontab|
|DelegatedControls.finish,4 modos|root antes, deploy window íntegro → restauração deploy → ambos before; demais condições preservadas|métodos reais com três configs completas/health/guard; root não restaurado e terceiro estado negam|PM2/root/nft reais e encerramento produtivo|
|Controls.enter/finish base|validação compartilhada antes dos efeitos e depois da restauração|delta revisável; caminho operacional delegado acima efetivamente ensaiado|caminho root monolítico de Controls base não executado como janela|
|restore_deploy_cron.py CLI|somente6 posições, CAS/lock, intent, uma chamada, recibo após pós-condições|28 casos: check/apply/inspect exatos, falhas e resposta perdida; negativos hash/owner/mode/output/escopo; replay não reinstala|instalação real crontab não executada|
|Host.observe do mesmo driver|pacote concreto/15b/identidades/NEWauth+NEWDB/16 fontes/.env/system cron/dumps600/guard38/health|**CHECK READ ONLY real na VPS09:03:19Fortaleza PASS**, driver/input publicados|nenhum restore/checkpoint de cifragem/start/SQL; não é teste funcional de cada job|

Provas antigas de restore/SQL/grant/decoder são preservadas, não contadas nos74 casos novos. Só o pequeno capsule de controles foi transferido inativo; nenhum adapter preventivo foi instalado.
