import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'espree';

const root=path.resolve('src');
const files=[];
function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isDirectory())collect(name);else if(/\.(ts|js)$/.test(name))files.push(name);}}
collect(root);
const graph=new Map(files.map(file=>[file,[]]));
const errors=[];
const relative=file=>path.relative(root,file).replaceAll('\\','/');
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  // JS uses ESLint's existing parser. TS imports use the restricted static
  // module syntax checked by tsc; dynamic imports are deliberately disallowed.
  let imports;
  if(file.endsWith('.js'))imports=parse(text,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'||n.type==='ExportAllDeclaration').flatMap(n=>n.source?[n.source.value]:[]);
  else imports=[...text.matchAll(/\b(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  if(/\bimport\s*\(/.test(text))errors.push(`${relative(file)}: dynamic imports need an explicit boundary rule`);
  if(/\b(?:ts-ignore|ts-nocheck|eslint-disable)\b/.test(text))errors.push(`${relative(file)}: disabled checking`);
  if(file.endsWith('.ts')&&/\bany\b/.test(text))errors.push(`${relative(file)}: use unknown and narrow the boundary`);
  const parts=relative(file).split('/');
  for(const specifier of imports){
    if(!specifier.startsWith('.'))continue;
    const base=path.resolve(path.dirname(file),specifier);
    const target=[base,base+'.ts',base+'.js'].find(name=>graph.has(name));
    if(!target){errors.push(`${relative(file)}: unresolved import ${specifier}`);continue;}
    graph.get(file).push(target);
    const destination=relative(target).split('/');
    if(parts[0]==='shared'&&destination[0]!=='shared')errors.push(`${relative(file)}: shared cannot import features/app`);
    if(parts[0]==='modules'&&destination[0]==='app')errors.push(`${relative(file)}: feature cannot import composition`);
    if(parts[0]==='modules'&&destination[0]==='modules'&&parts[1]!==destination[1])errors.push(`${relative(file)}: cross-feature UI must use an injected port`);
    if(parts.at(-1)==='application.ts'&&/presentation|infrastructure/.test(relative(target)))errors.push(`${relative(file)}: application imports adapter`);
  }
  if(parts.at(-1)==='application.ts'&&/\b(?:window|document|localStorage|sessionStorage|fetch)\s*[.(]/.test(text))errors.push(`${relative(file)}: application performs browser I/O without a port`);
}
const visited=new Set(),visiting=new Set();
function visit(file,trail=[]){if(visiting.has(file)){errors.push('Cycle: '+[...trail,file].map(relative).join(' -> '));return;}if(visited.has(file))return;visiting.add(file);for(const child of graph.get(file))visit(child,[...trail,file]);visiting.delete(file);visited.add(file);}
for(const file of files)visit(file);
if(errors.length)throw Error(errors.join('\n'));
console.log(`Architecture: ${files.length} frontend modules, no forbidden import or cycle.`);
