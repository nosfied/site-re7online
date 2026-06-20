# Seguranca

## Principios

O Converta adota controles de seguranca voltados a protecao de dados, segregacao por tenant, controle de acesso, rastreabilidade e reducao de exposicao de credenciais.

Principios aplicados:

- menor privilegio;
- segregacao por tenant;
- redacao de tokens e segredos;
- controle de sessao;
- auditoria operacional;
- armazenamento criptografado de secrets de canais;
- separacao entre console interno e app do cliente.

## Autenticacao E Sessao

O portal utiliza autenticacao propria para acesso ao `/app`, com:

- usuarios vinculados ao tenant;
- sessoes persistidas;
- controle de expiracao/revogacao conforme politica vigente;
- recuperacao de senha por e-mail;
- senha armazenada de forma segura;
- logout e controle de sessao.

## Autorizacao

O acesso a funcionalidades e controlado por:

- perfil do usuario;
- papel/RBAC;
- tenant;
- setor/departamento;
- feature flags;
- console interno para administracao tecnica.

## Segregacao De Dados

Cada registro operacional relevante e vinculado ao `clientId`/tenant:

- conversas;
- mensagens;
- leads;
- usuarios;
- departamentos;
- campanhas;
- templates;
- configuracoes;
- canais.

As APIs do app exigem autenticacao de tenant e validam escopo antes de retornar dados.

## Tokens E Credenciais

Credenciais de canais devem ser tratadas como segredo.

Controles:

- tokens nao aparecem em UI;
- tokens nao devem ser logados;
- tokens de channel accounts ficam em estrutura separada e criptografada;
- respostas administrativas retornam apenas `tokenStatus`/metadados seguros;
- dumps e anexos de proposta nao devem conter segredos.

## Logs

Logs operacionais devem ser redigidos e voltados para diagnostico:

- eventos de webhook;
- falhas de envio;
- falhas de persistencia;
- resolucao de tenant;
- status de jobs;
- health checks.

Nao devem ser registrados:

- tokens;
- senhas;
- API keys;
- conteudo sensivel desnecessario;
- dados pessoais sem finalidade.

## Backup E Recuperacao

O ambiente deve manter politica formal de backup, incluindo:

- backup do banco;
- backup de configuracoes;
- retencao definida;
- teste periodico de restore;
- armazenamento fora do servidor principal quando o edital exigir continuidade.

## Recomendacao Para Contratos Publicos

Para editais com grande volume, recomenda-se documentar:

- matriz de acesso;
- politica de senha;
- politica de backup/restore;
- plano de resposta a incidentes;
- relatorio de infraestrutura;
- retencao de logs;
- segregacao de ambientes.

