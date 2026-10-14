// Isolated test loader only. No links/dependencies are added to sealed payloads.
export async function resolve(specifier,context,nextResolve){
 try{return await nextResolve(specifier,context);}
 catch(e){
  if(e.code!=='ERR_MODULE_NOT_FOUND'||specifier.startsWith('.')||specifier.startsWith('/')||specifier.includes(':'))throw e;
  return nextResolve(specifier,{...context,parentURL:new URL('dist/_proof.js','file://'+process.env.SEED_TEST_BASE+'/').href});
 }
}
