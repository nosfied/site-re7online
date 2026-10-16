const{b,e,click,until}=require('./exercise.cjs');const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
(async()=>{
 const s=JSON.parse(fs.readFileSync('/tmp/re7-csv-browser-20261015/session.private.json')),key=`crm-import:${s.baseUrl}:${s.user.clientId}:${s.user.id}`;
 click('Fechar acompanhamento');click('Importar CSV');await until(`document.body.innerText.includes('Importação concluída.')`);click('Preparar outra importação');assert.equal(e(`localStorage.getItem(${JSON.stringify(key)})`),null);click('Cancelar');
 const id=crypto.randomUUID();e(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(id)});true`);b('reload');await until(`document.body.innerText.includes('admissão ainda não foi comprovada')`);
 assert.equal(e(`document.querySelector('input[type=file]').disabled`),true);assert.equal(e(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Preparar outra importação')`),false);
 b('screenshot','/tmp/re7-csv-browser-20261015/13-unobserved-final.png');
 fs.writeFileSync('/tmp/re7-csv-browser-20261015/reference-final.json',JSON.stringify({terminalCloseReopen:true,explicitTerminalClear:true,unobservedAdmissionRemainsUnknown:true,newSubmissionBlocked:true}));console.log('TERMINAL_AND_UNOBSERVED_REFERENCE_FINAL_PASS');
})();
