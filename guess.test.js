/* eslint-disable no-unused-vars */

import { guessFunctionMaxArity } from './guess.js';

describe('guessFunctionMaxArity', () => {
  const check = (fn, num) => {
    expect(guessFunctionMaxArity(fn, { parserOptions: { ecmaVersion: 2020 } })).toBe(num);
  };
  const checkNamed = (name, ...args) => check(...args);

  it.each([
    [() => {}, 0],
    [function () {}, 0],
    [function t() {}, 0],
    [async function () {}, 0],
    [async function t() {}, 0],

    [(a) => {}, 1],
    [function (a) {}, 1],
    [function t(a) {}, 1],
    [async function (a) {}, 1],
    [async function t(a) {}, 1],
    [async function async(a) {}, 1],

    [(a, b) => {}, 2],
    [function (a, b) {}, 2],
    [function t(a, b) {}, 2],
    [async function (a, b) {}, 2],
    [async function t(a, b) {}, 2],
    [async function async(a, b) {}, 2],
  ])('should detect basic function parameters (%s, n=%i)', check);

  it.each([
    [{ t() {} }.t, 0],
    [{ async t() {} }.t, 0],
    [{ async async() {} }.async, 0],

    [{ t(a) {} }.t, 1],
    [{ async t(a) {} }.t, 1],
    [{ async async(a) {} }.async, 1],
  ])('should understand method syntax (%s, n=%i)', check);

  it.each([
    [
      'bailout, substring/ellipse',
      () => {
        return '...';
      },
      0,
    ],
    [
      'bailout, substring/arguments',
      () => {
        return 'arguments';
      },
      0,
    ],

    [
      'unbounded, arguments',
      function () {
        return arguments;
      },
      Infinity,
    ],
    [
      'unbounded, arguments (n=3)',
      function (a, b, c) {
        return arguments;
      },
      Infinity,
    ],
    ['unbounded, rest', (...args) => args, Infinity],
    ['unbounded, rest (n=3)', (a, b, c, ...args) => args, Infinity],
  ])('should perform advanced analysis: %s', checkNamed);

  it.each([
    [
      'bailout, substring/ellipse',
      {
        a() {
          return '...';
        },
      }.a,
      0,
    ],
    [
      'bailout, substring/arguments',
      {
        a() {
          return 'arguments';
        },
      }.a,
      0,
    ],

    [
      'unbounded, arguments',
      {
        a() {
          return arguments;
        },
      }.a,
      Infinity,
    ],
    [
      'unbounded, arguments (n=3)',
      {
        a(a, b, c) {
          return arguments;
        },
      }.a,
      Infinity,
    ],
    [
      'unbounded, rest',
      {
        a(...args) {
          return args;
        },
      }.a,
      Infinity,
    ],
    [
      'unbounded, rest (n=3)',
      {
        a(a, b, c, ...args) {
          return args;
        },
      }.a,
      Infinity,
    ],
    [
      'bailout, escape reference',
      (function () {
        return () => arguments;
      })(),
      0,
    ],
    ['bailout, arguments override', new Function('arguments', 'return arguments'), 1],
    [
      'bailout, destructuring arguments override',
      new Function('{ arguments }', 'return arguments'),
      1,
    ],
    [
      'bailout, interior arguments',
      function (unused) {
        (function () {
          return arguments;
        })();
      },
      1,
    ],
  ])('should perform advanced method analysis: %s', checkNamed);

  const name = 't';
  it.each(
    [
      {
        function() {
          return '...';
        },
      },
      {
        *function() {
          yield '...';
        },
      },
      {
        async() {
          return '...';
        },
      },
      {
        *async() {
          yield '...';
        },
      },
      {
        [name]() {
          return '...';
        },
      },
      {
        *[name]() {
          yield '...';
        },
      },
      {
        async function() {
          return '...';
        },
      },
      {
        async *function() {
          yield '...';
        },
      },
      {
        async async() {
          return '...';
        },
      },
      {
        async *async() {
          yield '...';
        },
      },
      {
        async [name]() {
          return '...';
        },
      },
      {
        async *[name]() {
          yield '...';
        },
      },
    ].map((obj) => {
      const fn = Object.values(obj)[0];
      return [fn.toString().replace(/\s+/g, ' '), fn, 0];
    })
  )('should understand many method syntacies: %s', checkNamed);
});
