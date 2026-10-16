# Consumidores e alcance do ensaio

| Consumidor real | Prova local executada | Efeito/observação não exercitado |
|---|---|---|
| csv_contract + ecosystem/restore/baseline | Pacote completo, quatro modos, permissões/hashes/referências; negativos de mode, prova e seleção | Arquivos e referências presentes na VPS atual |
| Operations.stop/start | Par real em cada modo; ausência/ownership/DB via driver OS; intent único e seleção | PM2, /proc/sockets e PostgreSQL produtivos |
| Sequencer.close_then_preflight/finish | Restore retido e dois crons, ordem e encerramento | Transporte Node close/preflight, nft/HTTP/root substituídos |
| Sequencer.recover pré-parada | CLI real, identidade preservada; dois crons restaurados e conferidos separadamente | Alteração efetiva de systemd/crontab/root |
| csv_cli | Conclusão, pré-parada, API incerta, retorno candidato, drift frontend | Efeitos de sistema/SELECT e aplicação do literal Event substituídos |
| pre_install + admit_gates | Comandos reais, RPO/root, prova CSV/scope/review; expiração nega | Autoridade/root, clock e dump remoto injetados; nenhum gate produtivo admitido |
| capture_imports + csv_boundary | tenant/operação, terminal, UNKNOWN, legado ambíguo e observação incompleta | SELECT produtivo/cobertura de atividade conhecida; histórico sem registro não certificado |
| Event compilado + fonte dos tools | Cinco controles CRITICAL e hash exato do overlay | CAS/gravação do literal produtivo e comandos de retenção não executados |
| frontend_phase_contract + bind_frontend | Captura completa, sucessores sintéticos, crons, falha API, drift e não sobrescrita | Certificados dos futuros sucessores reais |
| frontend-check.init_run/run_from | Materialização real com perfis completos e bytes certificados; candidato e retorno | Localizadores /proc/boot/árvore/paths remotos substituídos |
| frontend-action | Gate antes do efeito e um start-intent; replay negado | subprocess PM2/HTTP substituído |
| Instaladores API/frontend | Templates emitidos e hashes; barreiras de revisão/identidade antes da instalação | sudo, root CAS, helpers e políticas não instalados |

As provas de navegador/API/PG e dos arquivos CSV compilados são as anteriores certificadas. Nenhum mock de health/listagem é apresentado como validação funcional CSV. Ver [provas com hashes](PROOFS_SANITIZED.json).
