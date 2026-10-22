import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { createHash } from 'node:crypto';

let cachedSource, cachedAnalysis;
const identifierName = /^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u;
const ignoredFields = new Set(['start','end','range','loc','raw']);
function inspect(source) {
  if(source === cachedSource) return cachedAnalysis;
  let result;
  try { result = inspectUncached(source); }
  catch(error) { result = { public: { supported:false, reason:error.message, signature:null, bindings:[] } }; }
  cachedSource = source; cachedAnalysis = result;
  return result;
}
function inspectUncached(source) {
  const tree = parse(source,{ecmaVersion:2022,sourceType:'script',ranges:true});
  const paths = new Map(), parents = new Map(), identifiers = [];
  function walk(node,path,parent,key) {
    if(!node || typeof node !== 'object' || !node.type)return;
    if(paths.has(node))throw Error('Shared AST nodes are unsupported');
    paths.set(node,path);parents.set(node,{parent,key});
    if(node.type === 'WithStatement')throw Error('with is unsupported');
    if(node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval')throw Error('Direct eval is unsupported');
    if(node.type === 'Identifier')identifiers.push(node);
    for(const [field,value] of Object.entries(node)) {
      if(Array.isArray(value))value.forEach((child,i)=>walk(child,`${path}.${field}[${i}]`,node,field));
      else if(value?.type)walk(value,`${path}.${field}`,node,field);
    }
  }
  walk(tree,'Program');
  const manager = analyze(tree,{ecmaVersion:2022,sourceType:'script',optimistic:false,directive:true,ignoreEval:false});
  const variableInfo = new Map(), identifierInfo = new Map(), bindings = [];
  for(const scope of manager.scopes) {
    if(scope.type !== 'global' && scope.dynamic)throw Error(`Dynamic ${scope.type} scope is unsupported`);
    const scopePath = paths.get(scope.block);
    if(!scopePath)throw Error('Scope has no structural identity');
    for(const variable of scope.variables) {
      const declarations = variable.identifiers.map(n=>paths.get(n)).sort();
      if(declarations.some(p=>!p))throw Error('Declaration has no structural identity');
      const identity = `${scope.type}:${scopePath}:${declarations.length?declarations.join('|'):'implicit:'+variable.name}`;
      const eligible = scope.type !== 'global' && declarations.length > 0 && !['arguments','eval'].includes(variable.name);
      const info = { variable, identity, eligible, declarations, scopeType:scope.type, name:variable.name, occurrences:new Set() };
      variableInfo.set(variable,info);
      if(eligible)bindings.push(info);
    }
  }
  function classify(node,info) {
    if(!paths.has(node))throw Error('Identifier has no structural identity');
    const previous = identifierInfo.get(node);
    if(previous && previous.identity !== info.identity)throw Error('Identifier belongs to multiple bindings');
    identifierInfo.set(node,info);
    if(info.variable)info.occurrences.add(node);
  }
  for(const info of variableInfo.values())for(const identifier of info.variable.identifiers)classify(identifier,info);
  for(const scope of manager.scopes)for(const reference of scope.references) {
    const info = reference.resolved ? variableInfo.get(reference.resolved) : {
      identity:'global:'+reference.identifier.name, eligible:false, name:reference.identifier.name
    };
    if(!info)throw Error('Reference has no resolved binding');
    classify(reference.identifier,info);
  }
  function isSyntaxName(node) {
    const {parent,key} = parents.get(node);
    return (['MemberExpression','Property','MethodDefinition','PropertyDefinition'].includes(parent?.type) &&
      !parent.computed && key === (parent.type === 'MemberExpression'?'property':'key')) ||
      (['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent?.type) && key === 'label') ||
      parent?.type === 'MetaProperty';
  }
  for(const identifier of identifiers)if(!identifierInfo.has(identifier) && !isSyntaxName(identifier)) {
    throw Error(`Unclassified identifier: ${identifier.name} at ${paths.get(identifier)}`);
  }
  bindings.sort((a,b)=>a.identity.localeCompare(b.identity,'en'));
  const identities = new Set();
  for(const info of variableInfo.values()) {
    if(identities.has(info.identity))throw Error('Ambiguous binding structural identity');
    identities.add(info.identity);
  }
  function canonical(value,parent,key) {
    if(typeof value === 'bigint')return {bigint:String(value)};
    if(typeof value === 'number' && !Number.isFinite(value))return {number:String(value)};
    if(!value || typeof value !== 'object')return value;
    if(Array.isArray(value))return value.map(v=>canonical(v,parent,key));
    const result = {};
    for(const [field,item] of Object.entries(value)) {
      if(ignoredFields.has(field))continue;
      if(field === 'name' && value.type === 'Identifier' && !isSyntaxName(value)) {
        const info = identifierInfo.get(value);
        result.name = info.eligible ? {binding:info.identity} : {fixed:info.name, binding:info.identity};
      } else if(field === 'shorthand' && value.type === 'Property')result[field]=false;
      else result[field]=canonical(item,value,field);
    }
    return result;
  }
  const signature = createHash('sha256').update(JSON.stringify(canonical(tree))).digest('hex');
  const descriptors = bindings.map((info,index)=>({index,name:info.name,identity:info.identity,
    scopeType:info.scopeType,declarations:info.declarations,references:info.variable.references.length}));
  return { public:{supported:true,signature,bindings:descriptors}, bindings, parents };
}

export function analyzeBindings(source) {
  return structuredClone(inspect(source).public);
}

export function rename(source, assignments) {
  const original = inspect(source);
  if(!original.public.supported || !Array.isArray(assignments))return null;
  const edits = new Map(), assigned = new Set();
  for(const assignment of assignments) {
    if(!assignment || !Number.isInteger(assignment.index) || assigned.has(assignment.index))return null;
    assigned.add(assignment.index);
    const info = original.bindings[assignment.index], name = assignment.name;
    if(!info || typeof name !== 'string' || !identifierName.test(name) || ['arguments','eval'].includes(name))return null;
    if(name === info.name)continue;
    for(const node of info.occurrences) {
      let text = name;
      const {parent,key} = original.parents.get(node);
      const owner = parent?.type === 'AssignmentPattern' && key === 'left' ? original.parents.get(parent).parent : parent;
      if(owner?.type === 'Property' && owner.shorthand)text=node.name+':'+name;
      const range = node.start+':'+node.end, previous = edits.get(range);
      if(previous && previous.text !== text)return null;
      edits.set(range,{start:node.start,end:node.end,text});
    }
  }
  let changed = source, previousStart = source.length;
  for(const {start,end,text} of [...edits.values()].sort((a,b)=>b.start-a.start)) {
    if(end > previousStart)return null;
    changed=changed.slice(0,start)+text+changed.slice(end);previousStart=start;
  }
  let rewritten;
  try { rewritten = inspectUncached(changed); }
  catch (_) { return null; }
  if(!rewritten.public.supported || rewritten.public.signature !== original.public.signature)return null;
  return changed;
}
