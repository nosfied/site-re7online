# Terceiro lote — delta observacional local

Nenhuma retirada ou instalação. Negativa original do segundo lote preservada, conforme SECOND_WITHDRAWAL_RESULT_2026-10-13.md. O driver novo permanece separado das gerações consumidas.

`ownership.py` inclui todos os PIDs, inclusive executor. Observa PID/start ticks antes/depois, cwd/exe/FD/maps, target e estatística estável do objeto. Erros preservam etapa, FD quando aplicável, classe/errno e mensagem original no diagnóstico privado; sem ler ambiente/conteúdo do objeto. Ambiente dos processos protegidos é conferido separadamente pelo contrato de configuração, sem publicar valores.

Um `(dev,ino)` igual continua proprietário, salvo prova positiva: tipo diferente ou birthtime statx posterior ao original, target fora dos caminhos originais e nlink positivo. Ctime diferente sozinho não prova reutilização. Target original, `(deleted)`, nlink0, nascimento indisponível/igual/anterior continuam negativos. Maps com chave coincidente exigem evidência do próprio map_files; permissão insuficiente, troca de objeto ou processo nega. Não exclui executor nem amplia amostras/retries.

Provas locais dirigidas:18 testes observacionais,13 do driver file-only e5 de extração. Incluem cenário diretório antigo/arquivo output novo, FD próprio, retirado ainda aberto, mmap após fechar FD, identidade de processo divergente, erro de FD, hardlinks/symlinks/diretórios/membro fora da lista, capacidade, intent consumido e parcial sem replay. Ensaio sintético não substitui leitura root atual nem certifica retirada futura.

Referências:7 testes de distinção entre namespace, arquivo explícito, diretório de configuração, symlink e manifesto relativo. O `prepare_policy.py` efetivo, hash c67018a12a628a6945ee28ac8628c1b6b7ff8df86eecd1d96295c6211e226603, foi confrontado com os mesmos bytes locais: a comparação de `root.parent` valida namespace e não usa todos os arquivos históricos como dependência. Nomes genéricos em código são registrados; vínculos explícitos de callers/configuração/manifests continuam selados. Binding relativo de dados irresolúvel continua bloqueado.

Recusas da preparação preservadas: v1 ModuleNotFoundError em carga `-I`, antes de ler estado; v2 negou hardlink; v3 auditoria completa conservadora interpretou namespaces como dependências. Dois nomes fa60 são hardlinks do mesmo inode/nlink2, portanto mantidos e não computados como bytes recuperáveis. Nada dessas ocorrências autoriza repetir retirada ou ajustar bindings produtivos.
