const{b,e,click,until}=require('./exercise.cjs');const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 await until(`document.body.innerText.includes('64 contatos no escopo')&&!document.querySelector('[role=dialog]')`);
 click('Próxima página');await until(`document.body.innerText.includes('64 contatos no escopo; 64 encontrados; 14 nesta página')`);b('screenshot','/tmp/re7-csv-browser-20261015/07-page-two.png');
 b('fill','input[placeholder]','Target');click('Aplicar');await until(`document.body.innerText.includes('64 contatos no escopo; 5 encontrados; 5 nesta página')`);assert.equal(e(`document.body.innerText.includes('Hidden anonymized synthetic')`),false);b('screenshot','/tmp/re7-csv-browser-20261015/08-filtered.png');
 b('fill','input[placeholder]','NoSuchSyntheticContact');click('Aplicar');await until(`document.body.innerText.includes('64 contatos no escopo; 0 encontrados; 0 nesta página')`);b('screenshot','/tmp/re7-csv-browser-20261015/09-empty-filter.png');
 click('Limpar');await until(`document.body.innerText.includes('64 contatos no escopo; 64 encontrados; 50 nesta página')`);
 const rejection=e(`(async()=>{const s=JSON.parse(localStorage.getItem('wa_app_session_local_v1'));const r=await fetch('/agent-api/app/crm/contacts/import/confirm',{method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:JSON.stringify({csvText:'phone,name\\n5584933333303,LegacySynthetic',mapping:{phoneColumn:'phone',nameColumn:'name'}})});const p=await r.json();return {status:r.status,code:p.error?.code}})()`);
 assert.equal(rejection.status,400);assert.equal(rejection.code,'invalid_import_operation_id');
 fs.writeFileSync('/tmp/re7-csv-browser-20261015/filter-results.json',JSON.stringify({pagination:[64,64,14],filtered:[64,5,5],empty:[64,0,0],anonymizedHidden:true,legacyPost:rejection}));console.log('FILTER_PAGINATION_ANONYMIZED_AND_LEGACY_POST_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
