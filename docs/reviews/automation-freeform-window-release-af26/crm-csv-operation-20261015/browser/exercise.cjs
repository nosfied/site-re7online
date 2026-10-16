const cp=require('child_process'),fs=require('fs'),assert=require('assert/strict');
const bin='/home/deifson-oliveira/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-linux-x64';
function b(...args){return cp.execFileSync(bin,['--session','re7-csv-review',...args],{encoding:'utf8',timeout:30000}).trim()}
function e(js){const v=b('eval',js);try{return JSON.parse(v)}catch{return v}}
function click(label){return e(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent.trim()===${JSON.stringify(label)}||x.getAttribute('aria-label')===${JSON.stringify(label)}));if(!b)throw Error('button_missing');b.click();return true})()`)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(js){for(let i=0;i<80;i++){if(e(js))return;await sleep(250)}throw Error('condition_timeout:'+js)}
module.exports={b,e,click,sleep,until};
