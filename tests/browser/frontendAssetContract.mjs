import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Browser assets are fetched from the exact frontend, never fulfilled by the API fixture.
export async function inspectFrontendAssets({ev, send, responses}) {
 const dom = await ev(`(() => {
  const links=[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href);
  const scripts=[...document.querySelectorAll('script[src]')].filter(x=>!x.noModule).map(x=>x.src);
  const sample=[...document.querySelectorAll('[class]')].filter(x=>x.classList.contains('flex')).slice(0,6).map(x=>({tag:x.tagName,class:x.className,display:getComputedStyle(x).display,width:x.getBoundingClientRect().width}));
  const probe=document.createElement('div');probe.className='flex gap-6 p-6 text-sm rounded-2xl';document.body.append(probe);const s=getComputedStyle(probe);const computed={display:s.display,gap:s.gap,padding:s.paddingTop,fontSize:s.fontSize,borderRadius:s.borderRadius};probe.remove();
  return {links,scripts,sample,computed,url:location.pathname,viewport:{width:innerWidth,height:innerHeight}};
 })()`);
 const response=responses.filter(x=>x.type==='Document'&&new URL(x.url).pathname===dom.url).at(-1);assert(response,'document_response_unobserved');
 const html={status:response.status,mime:response.mime};
 const assets=[];
 for(const url of [...dom.links,...dom.scripts]) {
  const found=responses.filter(x=>x.url===url).at(-1);assert(found,'unobserved referenced asset: '+url);
  const item={url,status:found.status,mime:found.mime,requestId:found.requestId};
  if(dom.links.includes(url)) {
   const value=await send('Network.getResponseBody',{requestId:found.requestId});const body=value.base64Encoded?Buffer.from(value.body,'base64').toString():value.body;
   Object.assign(item,{bytes:Buffer.byteLength(body),sha256:crypto.createHash('sha256').update(body).digest('hex'),unexpandedTailwind:/@tailwind\s+(base|components|utilities)\b/.test(body)});
  }
  assets.push(item);
 }
 const faults=[];
 if(html.status!==200||html.mime!=='text/html')faults.push('document_response_invalid');
 for(const item of assets) {
  if(item.status!==200)faults.push('asset_http:'+item.status);
  if(dom.links.includes(item.url)&&item.mime!=='text/css')faults.push('stylesheet_mime:'+item.mime);
  if(dom.scripts.includes(item.url)&&!['application/javascript','text/javascript'].includes(item.mime))faults.push('script_mime:'+item.mime);
  if(item.unexpandedTailwind)faults.push('tailwind_directives_unexpanded');
 }
 const expected={display:'flex',gap:'24px',padding:'24px',fontSize:'14px',borderRadius:'16px'};
 for(const [key,value] of Object.entries(expected))if(dom.computed[key]!==value)faults.push('utility_not_applied:'+key+':'+dom.computed[key]);
 return {...dom,html,assets,faults,result:faults.length?'FAIL':'PASS'};
}
export function assertFrontendAssetContract(value){assert.equal(value.result,'PASS',value.faults.join('; '));}
