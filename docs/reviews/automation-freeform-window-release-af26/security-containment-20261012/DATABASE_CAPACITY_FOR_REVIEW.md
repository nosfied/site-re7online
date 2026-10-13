# Disco raiz — preparação para decisão, não executada (13/10/2026)

**DECISÃO CORRENTE: expansão adiada; priorizar [lote de retenção auditado](retention-audit-20261013/REPORT.md). Nenhuma contratação ou expansão autorizada/executada.**

Banco permanece **CAPACITY DENY / EXECUTION BLOCKED**. Auth concluída/NEWauth preservada; out.15 CLOSED, guarda38 fechada. Nenhuma compra, expansão, parada, reboot, instalação, ALTER ROLE ou exclusão executada. Artefatos bancários v4 e provas válidas preservados.

## Provedor e decisão concreta

`OPERATIONAL_BASELINE.md` identifica DigitalOcean Droplet; leitura DMI atual confirmou `DigitalOcean / Droplet`. HEAD remoto inicial confirmado: `7afcd8554704af0dd73aa93006fd981aba23b230`.

O incremento de 2 GiB anteriormente sugerido era aritmético, não um tamanho contratado. Na família Basic Regular publicada, o salto mínimo acima de 60 GiB é **80 GiB (+20 GiB)**, com 4 GiB RAM/2 vCPU: **US$24/mês**, contra US$18/mês no plano 2 GiB/2 vCPU/60 GiB, diferença **US$6/mês**. Isso é preço de catálogo; plano/família contratados, elegibilidade regional, impostos, descontos e custos adicionais de backup/snapshot precisam da leitura do console. Não foi acessado o painel autenticado nem confirmada a fatura. Não presumir migração para v5: bundled/v5 não permitem resize entre famílias. [Preços oficiais](https://www.digitalocean.com/pricing/droplets).

**Não há resize online deste caminho.** O Droplet precisa desligar e depois ligar. A ampliação do disco é permanente; não existe retorno por redução do disco. Caminho no console: DigitalOcean → Droplets → **re7online-api-01**, conferir ID/IP contra a referência privada → Settings → Resize configuration / Edit (ou Actions → Resize) → Basic / Regular → 4 GiB, 2 vCPU, 80 GiB → permitir aumento de disco (não manter storage fixo) → revisar preço. Nesta etapa parar antes de confirmar/pagar/desligar. Se essa opção não estiver disponível ou o plano atual diferir, registrar a opção/preço/razão reais antes de decidir. [Procedimento oficial](https://docs.digitalocean.com/products/droplets/how-to/resize/).

A futura execução demanda autorização própria de infraestrutura e desligamento integral: API, worker, frontend, PostgreSQL, atendimento e automações ficarão indisponíveis. O fornecedor orienta reservar aproximadamente um minuto por GB ocupado; com cerca de 59 GB usados, planejar cerca de **uma hora**, sem prometer duração. Priorizar a janela sem uso humano informada; ausência de uso humano não interrompe automações por si só. Não executar resize via API como alternativa: a API também desliga o Droplet. Não criar/mover volume.

## Leitura atual e limites

13/10 **11:03:28 UTC / 08:03:28 Fortaleza**: `/dev/vda` 64.424.509.440 B (60 GiB); `/dev/vda1` ext4 `/`, 63.349.702.144 B. Kernel 6.8.0-71-generic. Setores lógico/físico 512 B, conferidos 11:06:28 UTC. Ferramentas já presentes: sfdisk, sgdisk, growpart, resize2fs.

| Partição | Início (setores de 512 B) | Tamanho (B) | Uso observado |
|---|---:|---:|---|
| vda14 | 2048 | 4.194.304 | sem mount; tipo GPT ainda depende da leitura root |
| vda15 | 10240 | 111.149.056 | vfat /boot/efi |
| vda16 | 227328 | 957.350.400 | ext4 /boot |
| vda1 | 2099200 | 63.349.702.144 | ext4 / |

A raiz ocupa o final do disco; boot/EFI ficam antes dela. A tentativa READ ONLY `sudo -n sfdisk --json /dev/vda` negou por senha necessária: **tabela GPT integral, UUIDs/tipos e superbloco não certificados ainda**. Dependência específica: sessão sudo de Deifson, sem nova delegação. Nenhuma senha solicitada/capturada.

`df` deploy nesta leitura: 2.119.364.608 B disponíveis. Não é CAPACITY PASS: não houve nova amostra PostgreSQL/WAL/global nesta rodada. Última aferição completa continua histórica: mínimo 2.104.283.136 B versus orçamento 2.173.698.048 B, déficit 69.414.912 B; WAL144MiB/slots0/archiveoff. Ganho bruto com80GiB:21.474.836.480B, sujeito ao filesystem e crescimento. Nenhum orçamento foi reduzido.

Capturas privadas off-host: geometry SHA `fdc745d675ba8c8dece08b327692e82aadd53ff3ce80498a43b0e9270d4bac27`; table/negação SHA `af97c2a513f07e0a2a19915bd50570416807db6626292400e092b8c2c89110b6`. Falha inicial de DNS no sandbox preservada; leitura retomada com acesso de rede autorizado, sem mutação.

## Preservação obrigatória antes de growpart

Bloco preparatório proposto para futura sessão sudo, **não executado**. Diretório novo obrigatório, sem sobrescrever histórico. Todos os outputs são privados; enviar apenas hashes/resumo. Estes comandos leem o disco e escrevem somente novos arquivos de evidência:

```bash
set -euo pipefail
umask 077
P=/dev/shm/re7-root-disk-before-expansion-20261013
 test ! -e "$P" && test ! -L "$P"
mkdir -m 700 "$P"
sudo -v
lsblk -b -o NAME,SIZE,START,TYPE,FSTYPE,MOUNTPOINTS > "$P/geometry.private.txt"
findmnt -no SOURCE,FSTYPE,TARGET / > "$P/mount.private.txt"
sudo -n /usr/sbin/sfdisk --dump /dev/vda > "$P/table.private.sfdisk"
sudo -n /usr/sbin/sfdisk --json /dev/vda > "$P/table.private.json"
sudo -n /usr/sbin/sgdisk --verify /dev/vda > "$P/gpt-check.private.txt" 2>&1
sudo -n /usr/sbin/sgdisk --backup="$P/table.root.private.gpt" /dev/vda > "$P/gpt-backup.private.txt" 2>&1
sudo -n cat "$P/table.root.private.gpt" > "$P/table.private.gpt"
sudo -n /usr/sbin/dumpe2fs -h /dev/vda1 > "$P/ext4.private.txt" 2> "$P/ext4.private.stderr"
(cd "$P" && sha256sum geometry.private.txt mount.private.txt table.private.sfdisk table.private.json table.private.gpt gpt-check.private.txt gpt-backup.private.txt ext4.private.txt ext4.private.stderr > files.sha256)
```

Não continuar diante de erro, GPT inconsistente, symlink ou geometria divergente. Preservar parcial e diagnóstico. Copiar arquivos/manifesto por scp para diretório off-host700, verificar SHA-256 integral, criar tar privado e extração limpa, validar GPT num **arquivo esparso isolado** com tamanho original e comparar sfdisk JSON (disk ID, starts, sizes, types e UUIDs; somente paths diferem). `sgdisk --load-backup` jamais sobre /dev/vda produtivo. A verificação do mecanismo em imagem sintética60GiB/4partições passou; isso não valida a tabela produtiva ainda não lida. Prova sintética não contém segredos nem substitui a preservação real.

Antes da futura parada: dump novo pelo lock/procedimento canônico, custódia off-host e integridade; preservação privada de ledger, cron/boot, configurações atuais com NEWauth, PM2 saved/fallback600, launcher/journals e referências de recuperação. Reutilizar prova de restore SQL apenas se schema/ferramentas idênticos; caso contrário novo restore isolado. Backup01:14UTC é histórico, não RPO atual. Dump SQL+tabela GPT não restauram sozinhos o sistema: exigir **snapshot completo recuperável**, após parada limpa ou consistência equivalente comprovada, com ID/estado/disponibilidade e custo confirmados no console antes do resize. Não criar snapshot nesta autorização. Validar console de recuperação do fornecedor e plano de retorno sem reativar segredos auth expostos.

## Execução futura condicionada e recuperação

Após nova decisão específica: conferir/preservar tudo acima, shutdown limpo pelo procedimento revisado, snapshot recuperável, resize80GiB e ligar. Primeira leitura pós-boot deve conferir identidade/boot/PM2, disco85.899.345.920B, GPT/root/EFI/boot. O cloud-init pode já ter expandido a partição/filesystem: **inspecionar antes**, não executar growpart indiscriminadamente.

Somente se vda1 ainda não cresceu e a geometria permitir, após revisão do dry-run:

```bash
sudo timeout 30 /usr/bin/growpart -N /dev/vda 1
# Confirmar que só o fim/tamanho da partição1 muda; starts/tipos/UUIDs/boot preservados.
sudo timeout 60 /usr/bin/growpart /dev/vda 1
# Reler GPT/lsblk; não seguir em timeout ou resultado incerto.
sudo timeout 120 /usr/sbin/resize2fs /dev/vda1
# Reler superbloco, df -B1 / e df -i /; nenhum fsck na raiz montada.
```

[Contrato growpart/dry-run](https://github.com/canonical/cloud-utils/blob/main/bin/growpart), [resize2fs/ext4](https://man7.org/linux/man-pages/man8/resize2fs.8.html). Expansão ext4 montada exige suporte do kernel; resize de filesystem não torna o resize do Droplet online. Em erro/timeout: preservar saída e reler geometria/filesystem, sem repetição automática. Não encolher, restaurar tabela antiga em disco ampliado ou executar reparo às cegas. Recovery console/snapshot são contingências sujeitas ao estado observado e decisão específica, não permissão de restore produtivo nesta preparação.

Depois exigir duas observações completas min(deploy/PostgreSQL)≥2.173.698.048B **mais crescimento/reservas recalculados**, WAL/slots/archive/erros/inodes, healthDB/serviços/sessões/cron/boot, guarda38/tasks/markers e out15/recibo preservados. O reboot muda boot/PIDs/ticks: a preparação bancária atual permanece preservada como artefato/prova, mas suas identidades não são autorização pós-reboot. Capturar geração nova pelo preparador canônico, sem adaptar bindings antigos; renovar dump/RPO/custódia antes da revisão da janela bancária. NEWauth em todos os caminhos; nenhuma instalação/ALTER antes de CAPACITY PASS.

Próxima decisão do owner: autorizar, após confirmar opção/fatura no console, **resize do mesmo Droplet para80GiB/4GiB/2vCPU e janela de desligamento/boot com snapshot**. Pendências preparatórias explícitas: leitura root/GPT e custódia/restauração da tabela real, confirmação de plano/custo regional/snapshot, conferência de recuperação automática após boot e controles/backup frescos. Não declarar pacote de execução integralmente pronto antes disso. Nenhum teste funcional ou build repetido; banco/providers/cifragem e liberação da guarda permanecem separados.
