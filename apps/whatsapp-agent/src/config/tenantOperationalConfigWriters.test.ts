import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function files(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):x.name.endsWith('.ts')&&!x.name.endsWith('.test.ts')?[path.join(dir,x.name)]:[]);}
function underLock(node:ts.Node) {
 for(let p:ts.Node|undefined=node.parent;p;p=p.parent)if(ts.isCallExpression(p)&&p.expression.getText()==='withLockedTenantOperationalConfig')return true;
 return false;
}
test('all config replacements are lexically locked or the audited private canned writer; create-only exception stays empty',()=>{
 let replacements=0,createOnly=0,cannedCalls=0;
 for(const file of [...files(path.join(root,'src')),...files(path.join(root,'scripts'))]){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const visit=(n:ts.Node)=>{
   if(ts.isCallExpression(n)){
    const expr=n.expression.getText(source);
    if(expr==='saveOperationalConfig'&&file.endsWith('/config/cannedReplies.ts')){assert(underLock(n),'canned mutation calculated outside lock');cannedCalls++;}
    if(/\.tenantOperationalConfig\.(upsert|update|updateMany|create|createMany)$/.test(expr)){
     if(file.endsWith('/tenantOperationalConfigStore.ts')){
      assert(expr.endsWith('.createMany'));assert(n.arguments[0].getText(source).includes('skipDuplicates: true'));
     }else if(file.endsWith('/http/routes.ts')){
      const arg=n.arguments[0];assert(ts.isObjectLiteralExpression(arg));const prop=arg.properties.find(p=>p.name?.getText(source)==='update');
      assert(prop&&ts.isPropertyAssignment(prop)&&ts.isObjectLiteralExpression(prop.initializer)&&prop.initializer.properties.length===0,'provisioning must not replace existing config');createOnly++;
     }else if(file.endsWith('/config/cannedReplies.ts')&&expr==='prisma.tenantOperationalConfig.upsert'){
      let fn:ts.Node|undefined=n;while(fn&&!ts.isFunctionDeclaration(fn))fn=fn.parent;
      assert(fn&&ts.isFunctionDeclaration(fn)&&fn.name?.text==='saveOperationalConfig');assert(!fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));replacements++;
     }else{assert(underLock(n),`unprotected config write: ${file}:${source.getLineAndCharacterOfPosition(n.getStart()).line+1}`);replacements++;}
    }
   }
   ts.forEachChild(n,visit);
  };visit(source);
 }
 assert.equal(replacements,35);assert.equal(createOnly,1);assert.equal(cannedCalls,3);
});
