# Operational Queue Production Mapping Audit - 2026-09-17

Status: READ-ONLY PRODUCTION AUDIT / OWNER LOCAL UX PASS / OWNER DECISIONS
COMPLETE / FINAL LOCAL CUTOVER PACKAGE PREPARED / NO PRODUCTION MUTATION / NO
DEPLOY.

Owner local UX result: PASS, confirmed on 2026-09-17. This opened the mapping audit gate.

Scope: complete reconciliation of all 54 production Department rows across 10 tenants before runtime cutover from legacy queue fallback to `Department.operationalQueueId`.

Rules applied:

- no queue name heuristic;
- no first-created heuristic;
- no most-used heuristic by itself;
- same tenant and same department only;
- exact ID mapping only;
- inactive rows may remain nullable when intentionally not routable;
- every active Department must have an explicit operational queue or approved remediation before cutover;
- no production mutation and no deploy in this gate.

Preflight:

- canonical local HEAD: `45726ef9154e8904e87189573b3c2ea7faa258bb`;
- origin canonical HEAD: `45726ef9154e8904e87189573b3c2ea7faa258bb`;
- production HEAD: `ed329ec8e778902d314ec84c2de3132b4f46b63a`;
- production health: PASS, `/agent-api/health` returned `ok=true`, `db=ok` at 2026-09-17T23:37:07Z;
- PM2 read-only: `re7-admin-front`, `re7-whatsapp-agent`, and `re7-whatsapp-web-worker` online;
- migration status: production has 58 migrations and is up to date; local `20260917213000_add_department_operational_queue` is not deployed.

Initial audit result:

- total departments: 54;
- auto-safe exactly-one queue mappings: 34;
- inactive null-allowed rows: 8;
- active zero-queue blockers: 2;
- multi-queue resolved by audit: 7;
- active multi-queue ambiguous blockers: 3;
- active unresolved total before owner decisions: 5.

Final owner decisions were supplied on 2026-09-18. The local reconciliation
package now resolves all active departments explicitly. Production cutover is
still NOT EXECUTED: no production migration, data mutation or deploy happened in
this gate.

Owner decision package:
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`.
Owner decisions are **COMPLETE** for all 5 previously active blockers.

Previously unresolved active rows and final owner decisions:

| Tenant | Department | Department ID | Previous reason | Owner decision |
| --- | --- | --- | --- | --- |
| `demo-converta` | Setor Teste | `cmu1no78102cf4sxsndoqtemc` | active with zero queues; membership/hours exist but no runtime/flow references | keep active; create/link internal queue `queue-operational-cmu1no78102cf4sxsndoqtemc` |
| `lab-websession` | Department Lunch | `cmsqrqwhp00054sefz4tgu5j1` | active with zero queues; hours exist but no membership/runtime/flow references | keep active; create/link internal queue `queue-operational-cmsqrqwhp00054sefz4tgu5j1` |
| `demo-converta` | Dúvidas Gerais - FUNDARPE | `cmsukc3vp00034s9pyfwbv7av` | active multi-queue; stale/non-active flow references split across both candidates and no current runtime | select `cmsukc3wa00094s9pa16davow` |
| `re7online` | Comercial | `cmraqfcly00014sisaysk2j9e` | active multi-queue; only weak event references, no runtime/flow/config evidence | select `cmraqfcm800034sisboqazhtv` |
| `re7online` | Governo e Licitações | `cmraqfcmn00094sisicjhc2l0` | active multi-queue; no decisive runtime/flow/config/event evidence | select `cmraqfcms000b4sis8s9wbqzs` |

## Tenant summary

Initial cardinality/classification summary remains preserved below for audit
history. Final local reconciliation after owner decisions resolves all active
departments: 44 explicit mappings, 2 owner-approved internal queues, 8 inactive
null-allowed rows, 0 active unresolved rows. Production has not been mutated.

| Tenant | Total departments | Auto-safe | Inactive null | Active zero-queue | Multi-queue resolved | Multi-queue ambiguous |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `cra-pr` | 6 | 6 | 0 | 0 | 0 | 0 |
| `demo-converta` | 15 | 7 | 2 | 1 | 4 | 1 |
| `demo-prefeitura` | 4 | 3 | 0 | 0 | 1 | 0 |
| `justa-advocacia` | 5 | 2 | 3 | 0 | 0 | 0 |
| `lab-websession` | 7 | 6 | 0 | 1 | 0 | 0 |
| `loadtest-prefeitura` | 3 | 3 | 0 | 0 | 0 | 0 |
| `re7online` | 6 | 3 | 0 | 0 | 1 | 2 |
| `secult-pe` | 3 | 2 | 0 | 0 | 1 | 0 |
| `syer-rodrigues` | 1 | 1 | 0 | 0 | 0 | 0 |
| `tendencia-modas` | 4 | 1 | 3 | 0 | 0 | 0 |

## Full reconciliation matrix
| Tenant | Department | Department ID | Active | Queue count | Current queues | Proposed operationalQueueId | Classification | Evidence | Remediation | Owner decision required? |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `cra-pr` | Cobrança | `cmtkhhxnm00094spnwswq75im` | YES | 1 | cmtkhhxnt000b4spntn9xifdu (Fila Geral) | `cmtkhhxnt000b4spntn9xifdu` | EXACTLY ONE QUEUE / AUTO-SAFE | members 4/4; hours 5; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]<br>cmtkhhxnt000b4spntn9xifdu: runtime 0/0, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `cra-pr` | Fiscalização | `cmtkhhxnd00054spnyrxt59nk` | YES | 1 | cmtkhhxng00074spna1hrvyqb (Fila Geral) | `cmtkhhxng00074spna1hrvyqb` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; hours 5; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]; events 3<br>cmtkhhxng00074spna1hrvyqb: runtime 0/0, snapshots 0, flows 1/1, config 0, events 2 | persist explicit queue id | NO |
| `cra-pr` | Gabinete da Presidência | `cmtkhhxof000l4spnjnv4zhjv` | YES | 1 | cmtkhhxoi000n4spnqvm6b037 (Fila Geral) | `cmtkhhxoi000n4spnqvm6b037` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; hours 5; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]<br>cmtkhhxoi000n4spnqvm6b037: runtime 0/0, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `cra-pr` | Registro | `cmtkhhxmp00014spndfwba4hx` | YES | 1 | cmtkhhxmx00034spnqvvk5mzu (Fila Geral) | `cmtkhhxmx00034spnqvvk5mzu` | EXACTLY ONE QUEUE / AUTO-SAFE | members 5/5; hours 5; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]; events 1<br>cmtkhhxmx00034spnqvvk5mzu: runtime 0/0, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `cra-pr` | Relações Institucionais | `cmtkhhxny000d4spn745xsxz2` | YES | 1 | cmtkhhxo1000f4spn2b04jiu1 (Fila Geral) | `cmtkhhxo1000f4spn2b04jiu1` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/3; hours 5; runtime 0/1; conversations 0/1; snapshots 2; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]; events 4<br>cmtkhhxo1000f4spn2b04jiu1: runtime 0/1, snapshots 2, flows 1/1, config 0, events 4 | persist explicit queue id | NO |
| `cra-pr` | TI | `cmtkhhxo8000h4spnacgwu9na` | YES | 1 | cmtkhhxob000j4spnpfcb6ken (Fila Geral) | `cmtkhhxob000j4spnpfcb6ken` | EXACTLY ONE QUEUE / AUTO-SAFE | members 3/3; hours 5; runtime 1/1; conversations 3/3; snapshots 5; flows 1/1: CRA-PR - Atendimento Institucional [active] [entry]; events 11<br>cmtkhhxob000j4spnpfcb6ken: runtime 1/1, snapshots 5, flows 1/1, config 0, events 11 | persist explicit queue id | NO |
| `demo-converta` | Atendimento Geral | `cmsiwk1o100014sdzl5cqd2ki` | YES | 2 | cmsiwk1ok00074sdzyazpzd7z (Fila principal)<br>cmsiyb2k200n94sdpu5khkee0 (Fila Geral) | `cmsiyb2k200n94sdpu5khkee0` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 2/4; hours 5; runtime 1/1; conversations 1/1; events 10<br>cmsiwk1ok00074sdzyazpzd7z: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0<br>cmsiyb2k200n94sdpu5khkee0: runtime 1/1, snapshots 0, flows 0/0, config 0, events 5 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `demo-converta` | Cobrança | `cmtg2g0zs00154sjgd1kez3iv` | YES | 1 | cmtg2g10000174sjgmir39vno (Cobrança) | `cmtg2g10000174sjgmir39vno` | EXACTLY ONE QUEUE / AUTO-SAFE | members 6/6; hours 5; runtime 1/1; conversations 0/1; flows 1/1: CRA-PR - Atendimento Institucional (Demo) [active] [entry]; events 1<br>cmtg2g10000174sjgmir39vno: runtime 1/1, snapshots 0, flows 1/1, config 0, events 1 | persist explicit queue id | NO |
| `demo-converta` | Duvidas tecnicas Mapa Cultural | `cmsj6g59q00014sts2bxg49mv` | NO | 1 | cmsj6g5a900074stsl4gchsoy (Fila Mapa Cultural) | `cmsj6g5a900074stsl4gchsoy` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/1<br>cmsj6g5a900074stsl4gchsoy: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `demo-converta` | Dúvidas Gerais - FUNDARPE | `cmsukc3vp00034s9pyfwbv7av` | YES | 2 | cmsukc3wa00094s9pa16davow (Dúvidas Gerais - FUNDARPE)<br>cmsze5h8d00174sl98ehwpsvt (Fila Geral) | `cmsukc3wa00094s9pa16davow` | MULTIPLE QUEUES / OWNER RESOLVED | members 1/5; hours 5; flows 0/2: SECULT-PE - Boas-vindas e triagem, CRA-PR AULA TESTE; events 2<br>cmsukc3wa00094s9pa16davow: runtime 0/0, snapshots 0, flows 0/1, config 0, events 0<br>cmsze5h8d00174sl98ehwpsvt: runtime 0/0, snapshots 0, flows 0/1, config 0, events 0 | persist owner-selected explicit id; preserve other queue | NO |
| `demo-converta` | Dúvidas Gerais - SECULT / PE | `cmsukc3vh00014s9pscq8i7iv` | YES | 2 | cmsukc3w400074s9pw9rv1yxi (Dúvidas Gerais - SECULT / PE)<br>cmsuyxixe04nb4snguc9z0j25 (Fila Geral) | `cmsukc3w400074s9pw9rv1yxi` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 1/5; hours 5; runtime 0/2; conversations 0/2; snapshots 2; flows 0/2: Atendimento SECULT/PE - Espelho operacional, SECULT-PE - Boas-vindas e triagem; tenant config 1; events 38<br>cmsukc3w400074s9pw9rv1yxi: runtime 0/2, snapshots 2, flows 0/2, config 0, events 7<br>cmsuyxixe04nb4snguc9z0j25: runtime 0/0, snapshots 0, flows 0/0, config 0, events 2 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `demo-converta` | Dúvidas Técnicas - Plataforma Mapa Cultural | `cmsukc3vv00054s9p0pem6gh8` | YES | 2 | cmsukc3wf000b4s9psxgb1ju0 (Dúvidas Técnicas - Plataforma Mapa Cultural)<br>cmsx0x08b00sl4s7a17drknf8 (Fila Geral) | `cmsukc3wf000b4s9psxgb1ju0` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 1/5; hours 5; flows 0/2: Atendimento SECULT/PE - Espelho operacional, SECULT-PE - Boas-vindas e triagem; tenant config 1; events 6<br>cmsukc3wf000b4s9psxgb1ju0: runtime 0/0, snapshots 0, flows 0/2, config 0, events 1<br>cmsx0x08b00sl4s7a17drknf8: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `demo-converta` | Fiscalização | `cmtg2g0x2000l4sjg3voybk97` | YES | 1 | cmtg2g0x7000n4sjg5bysxh7j (Fiscalização) | `cmtg2g0x7000n4sjg5bysxh7j` | EXACTLY ONE QUEUE / AUTO-SAFE | members 5/5; hours 5; snapshots 3; flows 1/1: CRA-PR - Atendimento Institucional (Demo) [active] [entry]; events 10<br>cmtg2g0x7000n4sjg5bysxh7j: runtime 0/0, snapshots 3, flows 1/1, config 0, events 4 | persist explicit queue id | NO |
| `demo-converta` | Gabinete Presidência | `cmtg2g13q002t4sjg9yjqagfy` | YES | 1 | cmtg2g13w002v4sjgy1y39adx (Gabinete Presidência) | `cmtg2g13w002v4sjgy1y39adx` | EXACTLY ONE QUEUE / AUTO-SAFE | members 5/5; hours 5; snapshots 2; flows 1/1: CRA-PR - Atendimento Institucional (Demo) [active] [entry]; events 2<br>cmtg2g13w002v4sjgy1y39adx: runtime 0/0, snapshots 2, flows 1/1, config 0, events 1 | persist explicit queue id | NO |
| `demo-converta` | Projetos e Editais | `cmsiwk1o800034sdzdhd603l7` | NO | 2 | cmsiwk1or00094sdzmv7lmn9d (Fila principal)<br>cmsze6xx5001b4sl9szpo5hro (Fila Geral) | `NULL` | MULTIPLE QUEUES + INACTIVE / NULL ALLOWED | members 1/1; events 1<br>cmsiwk1or00094sdzmv7lmn9d: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0<br>cmsze6xx5001b4sl9szpo5hro: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | keep nullable while inactive; decide queue only before activation | NO |
| `demo-converta` | Registro | `cmtg2g0u800014sjgjjeud8tp` | YES | 2 | cmtg2g0uo00034sjgh37pwiy1 (Registro)<br>cmtiyg66m01cr4s8jt0pkg58i (Fila Geral) | `cmtg2g0uo00034sjgh37pwiy1` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 8/8; hours 5; runtime 0/1; conversations 1/2; snapshots 14; flows 1/2: CRA-PR - Atendimento Institucional (Demo) [active] [entry], CRA-PR AULA TESTE; events 42<br>cmtg2g0uo00034sjgh37pwiy1: runtime 0/0, snapshots 13, flows 1/2, config 0, events 18<br>cmtiyg66m01cr4s8jt0pkg58i: runtime 0/1, snapshots 1, flows 0/0, config 0, events 3 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `demo-converta` | Relações Institucionais | `cmtg2g115001p4sjgo9cke0ny` | YES | 1 | cmtg2g11c001r4sjgy9iw36dh (Relações Institucionais) | `cmtg2g11c001r4sjgy9iw36dh` | EXACTLY ONE QUEUE / AUTO-SAFE | members 5/5; hours 5; runtime 0/1; conversations 0/1; snapshots 3; flows 1/1: CRA-PR - Atendimento Institucional (Demo) [active] [entry]; events 7<br>cmtg2g11c001r4sjgy9iw36dh: runtime 0/1, snapshots 3, flows 1/1, config 0, events 6 | persist explicit queue id | NO |
| `demo-converta` | Setor Teste | `cmu1no78102cf4sxsndoqtemc` | YES | 0 | - | `queue-operational-cmu1no78102cf4sxsndoqtemc` | ZERO QUEUES + ACTIVE / OWNER INTERNAL QUEUE APPROVED | members 1/1; hours 5; events 2<br>- | create internal queue and link atomically in controlled production reconciliation | NO |
| `demo-converta` | Suporte Tecnico | `cmsiwk1ob00054sdzvi98cer7` | NO | 1 | cmsiwk1ov000b4sdzfl4hzdnz (Fila principal) | `cmsiwk1ov000b4sdzfl4hzdnz` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0; events 1<br>cmsiwk1ov000b4sdzfl4hzdnz: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `demo-converta` | TI | `cmtg2g12h00294sjg07ynh2bi` | YES | 1 | cmtg2g12q002b4sjgigsskidm (TI) | `cmtg2g12q002b4sjgigsskidm` | EXACTLY ONE QUEUE / AUTO-SAFE | members 5/5; hours 5; flows 1/1: CRA-PR - Atendimento Institucional (Demo) [active] [entry]<br>cmtg2g12q002b4sjgigsskidm: runtime 0/0, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `demo-converta` | fdfswfw | `cmt2zla8g000f4sne6ehs0uio` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `demo-prefeitura` | Assistencia Social | `cmookf7yo000d4sqbpjfvjtab` | YES | 1 | cmookf7yt000f4sqb2nv5bpn8 (Fila Assistencia Social) | `cmookf7yt000f4sqb2nv5bpn8` | EXACTLY ONE QUEUE / AUTO-SAFE | members 1/1; runtime 3/5; conversations 4/5<br>cmookf7yt000f4sqb2nv5bpn8: runtime 3/5, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `demo-prefeitura` | Atendimento Geral | `cmookf7x100014sqbfkcm1p7l` | YES | 1 | cmookf7x900034sqbhwln4djp (Fila Geral) | `cmookf7x900034sqbhwln4djp` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; runtime 8/11; conversations 9/11<br>cmookf7x900034sqbhwln4djp: runtime 8/11, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `demo-prefeitura` | Educacao | `cmookf7xq00094sqbzoomc70m` | YES | 1 | cmookf7yc000b4sqbk8gd67dc (Fila Educacao) | `cmookf7yc000b4sqbk8gd67dc` | EXACTLY ONE QUEUE / AUTO-SAFE | members 1/1; runtime 3/6; conversations 4/6<br>cmookf7yc000b4sqbk8gd67dc: runtime 3/6, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `demo-prefeitura` | Saude | `cmookf7xi00054sqboc22ram4` | YES | 2 | cmookf7xl00074sqbtwwbi02j (Fila Saude)<br>cmop3a8kb00054sc0d5cjzute (Fila Geral) | `cmookf7xl00074sqbtwwbi02j` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 1/1; runtime 3/7; conversations 5/7<br>cmookf7xl00074sqbtwwbi02j: runtime 3/6, snapshots 0, flows 0/0, config 0, events 0<br>cmop3a8kb00054sc0d5cjzute: runtime 0/1, snapshots 0, flows 0/0, config 0, events 0 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `justa-advocacia` | Assistência Social | `cmo1qz68f00074sk58rz1v3f3` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `justa-advocacia` | Atendimento Geral | `cmo1qz67k00014sk5okuix9o0` | YES | 1 | cmomr3num00034sn9pgx40i80 (Fila Geral) | `cmomr3num00034sn9pgx40i80` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; runtime 4/4; conversations 4/4; events 60<br>cmomr3num00034sn9pgx40i80: runtime 1/1, snapshots 0, flows 0/0, config 0, events 22 | persist explicit queue id | NO |
| `justa-advocacia` | Educação | `cmo1qz68400054sk521uffji4` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `justa-advocacia` | Saúde | `cmo1qz67w00034sk565lvi4mh` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `justa-advocacia` | Tecnologia | `cmo1rgltu00714sdygpa6e6v1` | YES | 1 | cmomuz2tx00vr4szzfrd6q4rg (Fila Geral) | `cmomuz2tx00vr4szzfrd6q4rg` | EXACTLY ONE QUEUE / AUTO-SAFE | members 1/1<br>cmomuz2tx00vr4szzfrd6q4rg: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `lab-websession` | Atendimento Geral | `cmsokokqb00034sr72sp9ixmc` | YES | 1 | cmsokokqm00054sr7pnnz0cms (Fila Geral) | `cmsokokqm00054sr7pnnz0cms` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0; runtime 2/14; conversations 2/2; flows 1/2: 88I.6A Guided Builder Validation 2026-08-14T09:14:21.962Z, 88H.2 Lab Queue Chatbot Parity [active]; events 5<br>cmsokokqm00054sr7pnnz0cms: runtime 2/2, snapshots 0, flows 0/1, config 0, events 3 | persist explicit queue id | NO |
| `lab-websession` | Department A | `cmsqrqwgn00014sefgmxywqab` | YES | 1 | cmsqrqwif000b4sefspvxsv14 (Queue A) | `cmsqrqwif000b4sefspvxsv14` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; hours 1; runtime 1/1; flows 1/1: 88I.3 Department-Aware Flow Lab [active] [entry]; tenant config 1; events 1<br>cmsqrqwif000b4sefspvxsv14: runtime 1/1, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `lab-websession` | Department B | `cmsqrqwhx00074seflnzwgyfp` | YES | 1 | cmsqrqwig000f4sef6zlmnslm (Queue B) | `cmsqrqwig000f4sef6zlmnslm` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; hours 1; runtime 1/1; flows 1/1: 88I.3 Department-Aware Flow Lab [active] [entry]; tenant config 1; events 1<br>cmsqrqwig000f4sef6zlmnslm: runtime 1/2, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `lab-websession` | Department C | `cmsqrqwi300094sefenozvber` | YES | 1 | cmsqrqwig000h4sefuoqv2mvu (Queue C) | `cmsqrqwig000h4sefuoqv2mvu` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0; runtime 1/1; conversations 1/1; flows 1/1: 88I.3 Department-Aware Flow Lab [active] [entry]; events 2<br>cmsqrqwig000h4sefuoqv2mvu: runtime 1/1, snapshots 0, flows 1/1, config 0, events 1 | persist explicit queue id | NO |
| `lab-websession` | Department D | `cmsqrqwhm00034sefbhr9ovpi` | YES | 1 | cmsqrqwig000e4sef31uffn2h (Queue D) | `cmsqrqwig000e4sef31uffn2h` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0; hours 1; runtime 1/1; flows 1/1: 88I.3 Department-Aware Flow Lab [active] [entry]; events 1<br>cmsqrqwig000e4sef31uffn2h: runtime 1/1, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `lab-websession` | Department Lunch | `cmsqrqwhp00054sefz4tgu5j1` | YES | 0 | - | `queue-operational-cmsqrqwhp00054sefz4tgu5j1` | ZERO QUEUES + ACTIVE / OWNER INTERNAL QUEUE APPROVED | members 0/0; hours 2<br>- | create internal queue and link atomically in controlled production reconciliation | NO |
| `lab-websession` | Duvidas Tecnicas | `cmsqf1fj400034soy3n7q5tbj` | YES | 1 | cmsqf1fja00054soyavk5qh3r (Fila Duvidas Tecnicas) | `cmsqf1fja00054soyavk5qh3r` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; flows 1/1: 88H.2 Lab Queue Chatbot Parity [active]<br>cmsqf1fja00054soyavk5qh3r: runtime 0/0, snapshots 0, flows 1/1, config 0, events 0 | persist explicit queue id | NO |
| `loadtest-prefeitura` | Atendimento Geral | `cmqv1x7ji008l4sqyqs0raioe` | YES | 1 | cmqv1x7jp008n4sqyluzn9gtp (Fila Geral) | `cmqv1x7jp008n4sqyluzn9gtp` | EXACTLY ONE QUEUE / AUTO-SAFE | members 40/40; runtime 13/13; conversations 13/13; events 5<br>cmqv1x7jp008n4sqyluzn9gtp: runtime 13/13, snapshots 0, flows 0/0, config 0, events 5 | persist explicit queue id | NO |
| `loadtest-prefeitura` | Load Test Atendimento | `cmqux039e00034sgkl29lkevh` | YES | 1 | cmqux039n00054sgkg2xkpxmm (Fila Load Test) | `cmqux039n00054sgkg2xkpxmm` | EXACTLY ONE QUEUE / AUTO-SAFE | members 291/291<br>cmqux039n00054sgkg2xkpxmm: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `loadtest-prefeitura` | Load Test Suporte | `cmqux03a200074sgkc1t8am8a` | YES | 1 | cmqux03a700094sgks3so693y (Fila Load Test Suporte) | `cmqux03a700094sgks3so693y` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0<br>cmqux03a700094sgks3so693y: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `re7online` | Atendimento | `dept-default-f65561583ba04bc79569fb1fe800a34e` | YES | 1 | queue-default-f65561583ba04bc79569fb1fe800a34e (Fila Geral) | `queue-default-f65561583ba04bc79569fb1fe800a34e` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0<br>queue-default-f65561583ba04bc79569fb1fe800a34e: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist explicit queue id | NO |
| `re7online` | Atendimento Geral | `cmon3stsz000h4s8oa0l7iwvj` | YES | 1 | cmon3stt6000j4s8o1fahynjz (Fila Geral) | `cmon3stt6000j4s8o1fahynjz` | EXACTLY ONE QUEUE / AUTO-SAFE | members 3/3; runtime 20/21; conversations 19/21; events 39<br>cmon3stt6000j4s8o1fahynjz: runtime 17/18, snapshots 0, flows 0/0, config 0, events 33 | persist explicit queue id | NO |
| `re7online` | Comercial | `cmraqfcly00014sisaysk2j9e` | YES | 2 | cmraqfcm800034sisboqazhtv (Fila Comercial)<br>cmsypjirp000l4sq617fz41yd (Fila Geral) | `cmraqfcm800034sisboqazhtv` | MULTIPLE QUEUES / OWNER RESOLVED | members 2/2; events 8<br>cmraqfcm800034sisboqazhtv: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0<br>cmsypjirp000l4sq617fz41yd: runtime 0/0, snapshots 0, flows 0/0, config 0, events 4 | persist owner-selected explicit id; preserve other queue | NO |
| `re7online` | Governo e Licitações | `cmraqfcmn00094sisicjhc2l0` | YES | 2 | cmraqfcms000b4sis8s9wbqzs (Fila Governo)<br>cmrarax7g01874sa5l3l5imlb (Fila Geral) | `cmraqfcms000b4sis8s9wbqzs` | MULTIPLE QUEUES / OWNER RESOLVED | members 0/0<br>cmraqfcms000b4sis8s9wbqzs: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0<br>cmrarax7g01874sa5l3l5imlb: runtime 0/0, snapshots 0, flows 0/0, config 0, events 0 | persist owner-selected explicit id; preserve other queue | NO |
| `re7online` | Suporte | `cmraqfcme00054sis0ow5af4z` | YES | 2 | cmraqfcmj00074siskfe5j2lh (Fila Suporte)<br>cmrc60y700dwt4s8capsopmya (Fila Geral) | `cmraqfcmj00074siskfe5j2lh` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 2/2; runtime 1/3; conversations 1/3; flows 1/1: Converta Platform Support [active]; tenant config 1; events 3<br>cmraqfcmj00074siskfe5j2lh: runtime 1/3, snapshots 0, flows 1/1, config 1, events 1<br>cmrc60y700dwt4s8capsopmya: runtime 0/0, snapshots 0, flows 0/0, config 0, events 1 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `re7online` | Tecnologia | `cmonjramt00u34sx94vixz7b2` | YES | 1 | cmsyof9y1000x4s57fl0subqr (Fila Geral) | `cmsyof9y1000x4s57fl0subqr` | EXACTLY ONE QUEUE / AUTO-SAFE | members 0/0; events 2<br>cmsyof9y1000x4s57fl0subqr: runtime 0/0, snapshots 0, flows 0/0, config 0, events 1 | persist explicit queue id | NO |
| `secult-pe` | Dúvidas Gerais - FUNDARPE | `cmsrfhct800034swiil3xt1nc` | YES | 1 | cmsrfhctu000e4swic1fkrdpk (Dúvidas Gerais - FUNDARPE) | `cmsrfhctu000e4swic1fkrdpk` | EXACTLY ONE QUEUE / AUTO-SAFE | members 14/14; hours 5; runtime 0/15; conversations 0/5; snapshots 15; flows 1/1: SECULT-PE - Boas-vindas e triagem [active] [entry]; tenant config 1; events 58<br>cmsrfhctu000e4swic1fkrdpk: runtime 0/15, snapshots 15, flows 1/1, config 0, events 32 | persist explicit queue id | NO |
| `secult-pe` | Dúvidas Gerais - SECULT / PE | `cmsrfhct100014swipssy6qv7` | YES | 1 | cmsrfhcte00074swi2uyctgmf (Dúvidas Gerais - SECULT / PE) | `cmsrfhcte00074swi2uyctgmf` | EXACTLY ONE QUEUE / AUTO-SAFE | members 14/14; hours 5; runtime 1/230; conversations 3/86; snapshots 224; flows 1/1: SECULT-PE - Boas-vindas e triagem [active] [entry]; tenant config 1; events 746<br>cmsrfhcte00074swi2uyctgmf: runtime 1/230, snapshots 224, flows 1/1, config 0, events 436 | persist explicit queue id | NO |
| `secult-pe` | Dúvidas Técnicas - Plataforma Mapa Cultural | `cmsrfhcta00054swi5uyqdl23` | YES | 2 | cmsrfhcu2000l4swiyjsxpdg1 (Dúvidas Técnicas - Plataforma Mapa Cultural)<br>cmtkiavc507214s9p1k1ymq2b (Fila Geral) | `cmsrfhcu2000l4swiyjsxpdg1` | MULTIPLE QUEUES / RESOLVED BY AUDIT | members 7/7; hours 5; runtime 0/19; conversations 0/12; snapshots 17; flows 1/1: SECULT-PE - Boas-vindas e triagem [active] [entry]; tenant config 1; events 73<br>cmsrfhcu2000l4swiyjsxpdg1: runtime 0/17, snapshots 14, flows 1/1, config 0, events 36<br>cmtkiavc507214s9p1k1ymq2b: runtime 0/2, snapshots 3, flows 0/0, config 0, events 7 | persist audited explicit id; preserve other queues as historical/specialized | NO |
| `syer-rodrigues` | Campanha 2026 | `cmtoek1lh000d4s5wypu422ip` | YES | 1 | cmtoekafy00014s4lg41vs5i0 (Fila Geral) | `cmtoekafy00014s4lg41vs5i0` | EXACTLY ONE QUEUE / AUTO-SAFE | members 2/2; hours 6; runtime 1/1; snapshots 18; flows 1/4: Atendimento - Campanha 2026, Fluxo principal teste, Fluxo principal teste2, Fluxo principal teste3 CRA-PR [active] [entry]; tenant config 1; events 1<br>cmtoekafy00014s4lg41vs5i0: runtime 1/1, snapshots 18, flows 1/3, config 0, events 0 | persist explicit queue id | NO |
| `tendencia-modas` | Assistência Social | `cmondp3b700074szj0ftn8rjo` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `tendencia-modas` | Atendimento Geral | `cmondp3ai00014szjxmoynmgx` | YES | 1 | cmonezwil00034sdo4o6n13p8 (Fila Geral) | `cmonezwil00034sdo4o6n13p8` | EXACTLY ONE QUEUE / AUTO-SAFE | members 4/4; runtime 11/11; conversations 11/51; snapshots 40; tenant config 1; events 173<br>cmonezwil00034sdo4o6n13p8: runtime 8/8, snapshots 40, flows 0/0, config 0, events 69 | persist explicit queue id | NO |
| `tendencia-modas` | Educação | `cmondp3az00054szjt8eapjas` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
| `tendencia-modas` | Saúde | `cmondp3as00034szjagqsq16p` | NO | 0 | - | `NULL` | ZERO QUEUES + INACTIVE / INTENTIONAL NULL | members 0/0<br>- | keep nullable; create queue only before activation | NO |
