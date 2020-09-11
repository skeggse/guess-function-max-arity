import assert from 'assert';

import { parseExpressionAt, tokTypes, tokenizer } from 'acorn';
import { namedTypes as n } from 'ast-types';
import * as scope from 'scope-analyzer';

const fnToString = Function.prototype.toString;

const NATIVE_IMPL = /^\s*function\s*\(\s*\)\s*\{\s*\[native code]\s*\}\s*$/;
const CAN_READ_FUNCTION_SOURCE = fnToString.call((args) => args).includes('args');
const CAN_INFER_FUNCTION_SPREAD = fnToString.call((...args) => args).includes('...');
const MAYBE_VARIADIC = /\.\.\.|arguments/;

function tokenize(src, parserOptions) {
  const t = tokenizer(src, parserOptions);
  function getToken() {
    const token = t.getToken(),
      { type } = token;
    if (type.isLoop || type.isAssign || type.prefix || type.postfix) {
      throw new SyntaxError(`unexpected token ${require('util').format(type)}`);
    }
    return token;
  }
  return {
    getToken,
    [Symbol.iterator]: () => ({
      next() {
        const token = getToken();
        return token === tokTypes.eof ? { done: true } : { done: false, value: token };
      },
    }),
  };
}

function guessFnCtxInAsync(t) {
  const { type } = t.getToken();
  switch (type) {
    // e.g. { async [name]() {} }
    case tokTypes.bracketL:
    // e.g. { async *name() {} }
    // fallthrough
    case tokTypes.star:
    // e.g. { async() {} }
    // fallthrough
    case tokTypes.parenL:
      return 'method';
    // Technically, this could also have originally been defined as a method with the name
    // `function`, but it'll still parse as a valid expression so we can just treat it as one.
    case tokTypes._function:
      return 'expression';
    // We've scanned "async <name>" thus far, where <name> is not `function`. We now expect an
    // open parenthesis corresponding to a method definition.
    case tokTypes.name:
      if (t.getToken().type === tokTypes.parenL) return 'method';
  }
  throw new Error(`unexpected token ${type.label}`);
}

function guessFnCtx(t) {
  // Comments aren't tokens, so we don't need to worry about them.
  const { type, value } = t.getToken();
  if (type.label === 'name') {
    // { async() {} }
    // { async name() {} }
    // async function () {}
    if (value === 'async') {
      return guessFnCtxInAsync(t);
    }
  }
  switch (type) {
    // e.g. () => {}
    case tokTypes.parenL:
    // e.g. function () {}
    // fallthrough
    case tokTypes._function:
      return 'expression';
    // e.g. { [name]() {} }
    case tokTypes.bracketL:
    // e.g. { name() {} }
    // e.g. { async name() {} }
    // fallthrough
    case tokTypes.name:
    // e.g. { *name() {} }
    // fallthrough
    case tokTypes.star:
      return 'method';
  }
  return null;
}

function parseFn(src, parserOptions) {
  // TODO: merge tokenizer with parser somehow?
  const t = tokenize(src, parserOptions);
  const ctx = guessFnCtx(t);
  switch (ctx) {
    case 'expression':
      return parseExpressionAt(src, 0, parserOptions);
    case 'method':
      return parseExpressionAt(`({${src}})`, 0, parserOptions).properties[0].value;
  }
  return null;
}

function closest(node, predicate) {
  if (predicate.check) predicate = predicate.check.bind(predicate);
  for (; node; node = node.parent) {
    if (predicate(node)) return node;
  }
  return null;
}

function assertFnLength(fn, ast, hasRest) {
  if (ast.params.length - hasRest !== fn.length) {
    throw new Error('inconsistent parameter count');
  }

  return fn.length;
}

function hasArgumentsReference(ast) {
  if (n.ArrowFunctionExpression.check(ast)) return false;

  const binding = scope.scope(ast).bindings.get('arguments');

  // Redefinition means it's no longer possible to access the special arguments binding.
  if (binding.definition) return false;

  return binding.getReferences().some((refNode) => {
    const fnNode = closest(refNode, n.Function);
    if (!fnNode) throw new Error('could not locate ancestor function');
    return fnNode === ast;
  });
}

function predefineArgumentsBinding(fnNode) {
  if (!n.ArrowFunctionExpression.check(fnNode)) {
    const fnScope = scope.createScope(fnNode, ['arguments']),
      { define } = fnScope;
    fnScope.define = function (binding) {
      // If arguments gets redefined, remove the built-in binding to allow the appropriate
      // definition reference.
      if (binding.definition && binding.name === 'arguments') {
        this.bindings.delete('arguments');
      }
      return define.call(this, binding);
    };
    assert(!fnScope.bindings.get('arguments').definition);
  }
}

function parseAndGuess(fn, ast, restNode) {
  // Define the arguments before crawling the tree, so that any references to arguments are
  // correctly associated with the function-provided arguments binding.
  predefineArgumentsBinding(ast);
  scope.crawl(ast);

  // Validate that we did, in fact, set the parent field on all the AST Nodes.
  assert.strictEqual(ast.body.parent, ast);

  if (hasArgumentsReference(ast)) return Infinity;

  // TODO: why can't we use getBinding(restNode) instead of bindings.get?
  if (restNode && scope.scope(ast).bindings.get(restNode.name).isReferenced()) {
    return Infinity;
  }

  return assertFnLength(fn, ast, !!restNode);
}

// If it's an arrow function, then it cannot reference `arguments`.
export function guessMaxArity(fn, { parserOptions = { ecmaVersion: 2020 } } = {}) {
  if (!CAN_READ_FUNCTION_SOURCE) return Infinity;

  const src = fnToString.call(fn);

  if (NATIVE_IMPL.test(src)) return Infinity;

  // These no substitute for these if you want to get more than your stated
  // function length.
  if (CAN_INFER_FUNCTION_SPREAD && !MAYBE_VARIADIC.test(src)) {
    return fn.length;
  }

  const ast = parseFn(src, parserOptions);
  n.Function.assert(ast);

  const isArrow = n.ArrowFunctionExpression.check(ast);
  let restNode = null,
    lastParam;
  if (ast.params.length && n.RestElement.check((lastParam = ast.params[ast.params.length - 1]))) {
    restNode = lastParam.argument;
    n.Identifier.assert(restNode);
  }
  if (isArrow && !restNode) return assertFnLength(fn, ast, false);

  return parseAndGuess(fn, ast, restNode);
}

// Alias, in case folks want to import the name corresponding to the package name.
export { guessMaxArity as guessFunctionMaxArity };
