# guess-function-max-arity

![Node.js CI](https://github.com/skeggse/guess-function-max-arity/workflows/Node.js%20CI/badge.svg)

SEnD HelP

## About

Guess the maximum number of arguments the given function will consume.

Determines, with a small amount of analysis, whether the function is variadic. Suspected variadic functions will produce `Infinity`.

Intended use case: sane defaults for optimization flags in developer-oriented tooling.

Please don't use this in your production code.

## Install

```sh
$ npm i guess-function-max-arity
```

## Usage

```js
import { guessMaxArity } from 'guess-function-max-arity';

guessArity(() => {}); // 0
guessArity((...args) => args); // Infinity
guessArity(function () {
  return arguments;
}); // Infinity

guessArity({
  async *async() {
    return 'arguments';
  },
}); // 0

guessArity(
  () =>
    function () {
      return arguments;
    }
); // 0

guessArity(function (arguments) {
  return arguments;
}); // 1
```
