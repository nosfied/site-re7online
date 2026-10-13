# Capacidade — proposta de expansão, não executada

CAPACITY DENY: mínimo deploy/PostgreSQL2.104.283.136B, orçamento2.173.698.048B, déficit69.414.912B no13/10 07:33Fortaleza/10:33UTC. WAL144MiB (cresceu64MiB desde o retrato80MiB), slots0/archiveoff. Staging final2.887.680B; consumidor restante não integralmente atribuído porque du20s expirou. Não usar leitura parcial como inventário completo nem reduzir orçamento para PASS.

Disco raiz existente da VPS re7online-api-01: `/dev/vda`,64.424.509.440B=60GiB; `/dev/vda1`ext4 montado em `/`, partição63.349.702.144B. PostgreSQL, ledger e staging compartilham essa capacidade. Ferramentas growpart/resize2fs já presentes; nenhuma instalação necessária.

Proposta mínima revisável: owner ampliar **o disco raiz existente de60 para62GiB** (66.571.993.088B, +2GiB), pelo console do provedor atual. Se o plano só aceitar incrementos maiores, confirmar essa opção/custo; não criar/mover volume ou presumir resize online suportado pelo fornecedor. Incremento2GiB deixaria margem estimada≈2,08GB acima do orçamento atual, sujeita ao crescimento real. Não é CAPACITY PASS até nova leitura por deploy/PostgreSQL.

Após autorização específica de infraestrutura, backup/RPO/custódia verificados e ampliação confirmada, blocos propostos na sessão sudo do owner — **NÃO EXECUTAR nesta autorização de preparação**:

```bash
set -euo pipefail
umask 077
lsblk -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
findmnt -no SOURCE,FSTYPE,TARGET /
# Exigir vda>=66571993088B, raiz/dev/vda1ext4 e geometria atual consistente.
sudo timeout 30 /usr/bin/growpart -N /dev/vda 1
# Rever o dry-run/partições EFI/boot preservadas antes da mutação.
sudo timeout 60 /usr/bin/growpart /dev/vda 1
lsblk -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
sudo timeout 120 /usr/sbin/resize2fs /dev/vda1
df -B1 /
df -i /
```

`growpart -N` é dry-run; crescimento da partição e do filesystem são passos distintos. [Fonte Canonical/cloud-utils](https://github.com/canonical/cloud-utils/blob/main/bin/growpart), [manual do autor de resize2fs](https://man7.org/linux/man-pages/man8/resize2fs.8.html). Resizeext4 montado depende do suporte do kernel; não inferir reboot automático nem repetir mutações após timeout. Em erro/resultado incerto: inspecionar geometria/fs/espaço antes de qualquer continuação. Se provedor exigir parada/reboot, apresentar janela/retorno próprios; não abrangidos nesta preparação.

Depois: duas amostras completas min(deploy/postgres), inodes/WAL/growth, PostgreSQL/health/atendimento, identidades, guarda38, out15/recibo/dumps/sessões. Só com PASS real continuar revisão/instalação bancária. Nenhuma exclusão de releases, retornos, evidências, WAL, prune ou retenção; nenhuma expansão realizada.
