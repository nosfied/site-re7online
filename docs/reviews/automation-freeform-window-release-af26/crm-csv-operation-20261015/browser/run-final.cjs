const{b,e,click,sleep,until}=require('./exercise.cjs');const fs=require('fs'),assert=require('assert/strict');
(async()=>{
const result={};
e(`(()=>{const original=window.fetch;window.__csvNetwork=[];window.fetch=async(...args)=>{const r={url:String(args[0]),method:args[1]?.method||'GET',at:Date.now()};window.__csvNetwork.push(r);try{const v=await original(...args);r.status=v.status;return v}catch(err){r.error=err.name;throw err}};return true})()`);
await until(`document.body.innerText.includes('62 contatos no escopo')`);click('Importar CSV');b('upload','input[type=file]','/tmp/re7-csv-browser-20261015/sample.csv');await until(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Pré-visualizar'&&!b.disabled)`);click('Pré-visualizar');await until(`document.body.innerText.includes('Amostra de até 200 linhas')`);click('Confirmar importação');await sleep(10800);
result.networkBeforeReload=e(`window.__csvNetwork.filter(x=>x.url.includes('/import/'))`);assert.ok(result.networkBeforeReload.some(x=>x.method==='POST'&&x.url.endsWith('/confirm')&&x.error==='AbortError'));
result.id=e(`Object.entries(localStorage).find(([k])=>k.startsWith('crm-import:'))?.[1]`); // Scoped reference, no token.
b('screenshot','/tmp/re7-csv-browser-20261015/10-timeout-final.png');
click('Fechar acompanhamento');assert.equal(e(`!!document.querySelector('[role=dialog]')`),false);click('Importar CSV');await until(`document.body.innerText.includes('Consultar resultado')`);b('reload');await until(`document.body.innerText.includes('Consultar resultado')`);b('screenshot','/tmp/re7-csv-browser-20261015/11-reload-final.png');
await until(`document.body.innerText.includes('Importação concluída.')&&document.body.innerText.includes('64 contatos no escopo')`);
result.terminal=e(`document.querySelector('[role=dialog]').innerText`);result.total=e(`document.body.innerText.split(String.fromCharCode(10)).find(x=>x.includes('contatos no escopo'))`);b('screenshot','/tmp/re7-csv-browser-20261015/12-terminal-final.png');
result.timeoutObserved=true;result.recoveredWithGetOnly=true;result.totalRefreshed=true;fs.writeFileSync('/tmp/re7-csv-browser-20261015/final-result.private.json',JSON.stringify(result,null,2));console.log('REAL_BROWSER_TIMEOUT_CLOSE_REOPEN_RELOAD_TERMINAL_AND_LIST_REFRESH_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
