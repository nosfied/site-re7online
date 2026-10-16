# Sugestões separadas — NÃO IMPLEMENTADAS

Estas propostas não integram o predicado compartilhado nem autorizam mudança operacional.
Exigem contrato canônico, análise dos produtores/consumidores e aceite próprios antes de qualquer implementação:

- Exigir owner/modo600/nlink1 e leitura no-follow/estável para o arquivo de bindings.
- Rejeitar JSON com chaves duplicadas, referências extras ou valores vazios.
- Exigir caminhos absolutos normalizados, cwd/script sem aliases e script dentro de cwd.
- Exigir que toda .data existente esteja listada e seja symlink; verificar todos os destinos mesmo em start de um único app.
- Exigir diretório destino existente/canônico e união exata das referências dos quatro modos.
- Validar schema adicional dos perfis além da leitura usada por Operations.

Essas exigências foram removidas deste incremento. Preservar a semântica original não constitui recomendação de segurança dessas permissividades. Os verificadores canônicos não afetados permanecem autoridades independentes.
O predicado Event preexistente de pais sem symlinks e sem escrita de grupo/mundo permanece implementado e não é flexibilizado.
