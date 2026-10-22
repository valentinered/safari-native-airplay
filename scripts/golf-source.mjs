import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { minify } from 'terser';
import { analyzeBindings, rename } from './scope-rename.mjs';

export async function golfSource(source, profile) {
  const tree = parse(source, { ecmaVersion: 2022 });
  assert.equal(tree.body.length, 1, 'Expected the bookmarklet IIFE');
  const call = tree.body[0].expression;
  assert.equal(call?.type, 'CallExpression');
  assert.equal(call.callee.type, 'ArrowFunctionExpression');
  const body = call.callee.body.body;
  assert.equal(body[0].directive, 'use strict');
  const functions = body.filter(node => node.type === 'FunctionDeclaration');
  const byName = new Map(functions.map(node => [node.id.name, source.slice(node.start, node.end)]));
  assert.equal(byName.size, functions.length, 'Duplicate function declarations');
  assert.deepEqual([...byName.keys()].sort(), [...profile.functionOrder].sort(), 'Update the build function order after changing declarations');
  let reordered = '', end = 0;
  for (const [index, node] of functions.entries()) {
    reordered += source.slice(end, node.start) + byName.get(profile.functionOrder[index]);
    end = node.end;
  }
  reordered += source.slice(end);

  const { alphabet } = profile;
  assert.equal(new Set(alphabet).size, 54);
  const { code } = await minify(reordered, {
    mangle: { nth_identifier: { get(index) {
      assert(index < alphabet.length, 'Retune the identifier profile after source growth');
      return alphabet[index];
    } } },
  });
  const analysis = analyzeBindings(code);
  assert(analysis.supported, analysis.reason);
  for (const assignment of profile.assignments) {
    assert.equal(analysis.bindings[assignment.index]?.name, assignment.from,
      'Retune the identifier profile after changing bindings');
  }
  const renamed = rename(code, profile.assignments);
  assert.notEqual(renamed, null, 'Identifier profile failed AST/binding equivalence');
  return renamed;
}
