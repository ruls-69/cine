"""AST dependency rules using the standard library; runs in lint and CI."""
import ast
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FORBIDDEN_DOMAIN={'sqlite3','http','smtplib','ctypes','psycopg','os','storage','server','auth_config'}
ADAPTERS={'infrastructure','biometric','mail','thermal','print_queue','printing','presentation'}

def check(root=ROOT):
    paths=list((root/'erp').rglob('*.py'))
    modules={'.'.join(p.relative_to(root).with_suffix('').parts):p for p in paths}
    graph={name:set() for name in modules};errors=[]
    for name,path in modules.items():
        tree=ast.parse(path.read_text(encoding='utf-8'))
        pure=path.stem in {'domain','admissions','validation','records','operations','trailers'}
        application='.application.' in name or path.stem=='application'
        for node in ast.walk(tree):
            dependencies=[]
            if isinstance(node,ast.Import):dependencies=[a.name for a in node.names]
            elif isinstance(node,ast.ImportFrom):
                base=node.module or ''
                dependencies=[base]+[base+'.'+a.name for a in node.names]
            for dependency in dependencies:
                if dependency in graph:graph[name].add(dependency)
                parts=set(dependency.split('.'))
                if pure and (parts & FORBIDDEN_DOMAIN or parts & ADAPTERS):errors.append(f'{name}:{node.lineno}: domain -> {dependency}')
                if application and parts & ADAPTERS:errors.append(f'{name}:{node.lineno}: application -> adapter {dependency}')
                if '.shared.' in name and '.modules.' in dependency:errors.append(f'{name}: shared -> feature {dependency}')
                source_parts=name.split('.');target_parts=dependency.split('.')
                if len(source_parts)>3 and len(target_parts)>3 and source_parts[:2]==target_parts[:2]==['erp','modules'] and source_parts[2]!=target_parts[2]:
                    if target_parts[3] not in {'domain','admissions'}:errors.append(f'{name}: cross-feature access outside public domain API: {dependency}')
                if dependency in {'server','cinema','cash','candy','ticketing','payroll','storage','auth_config','thermal','cloud_print','payroll_mail'}:errors.append(f'{name}: import compatibility facade {dependency}')
    visiting=set();visited=set()
    def visit(name,trail):
        if name in visiting:errors.append('Cycle: '+' -> '.join(trail+[name]));return
        if name in visited:return
        visiting.add(name)
        for dependency in graph[name]:visit(dependency,trail+[name])
        visiting.remove(name);visited.add(name)
    for name in graph:visit(name,[])
    return errors,len(paths)

if __name__=='__main__':
    errors,count=check()
    if errors:raise SystemExit('\n'.join(sorted(set(errors))))
    print(f'Architecture: {count} Python modules, no forbidden dependency or cycle.')
