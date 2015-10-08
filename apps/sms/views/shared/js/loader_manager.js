/*
 * How to use LoaderManager.
 *
 * module A:
 *
 * exports.A = LoaderManager.define('A', {
 *   method() { // do something }
 * });
 *
 * module B:
 *
 * exports.B = LoaderManager.define('B', {
 *   method: LoaderManager.needs(['A'], function() {
 *     return A.method();
 *   })
 * });
 *
 * B.method returns a Promise. When calling it, LoaderManager will actually call
 * it only when A has been loaded, or defer its call otherwise.
 */
(function(exports) {
  'use strict';

  const defined = new Map();
  const promises = new Map();

  function getPromise(need) {
    if (defined.has(need)) {
      return Promise.resolve();
    }

    if (promises.has(need)) {
      return promises.get(need).promise;
    }

    var defer = {};
    return (defer.promise = new Promise(resolve => defer.resolve = resolve));
  }

  exports.LoaderManager = {
    define(name, what) {
      if (defined.has(name)) {
        throw new Error(`${name} is already defined.`);
      }

      defined.set(name, true);
      if (promises.has(name)) {
        promises.get(name).resolve();
        promises.delete(name);
      }

      return what;
    },

    needs(needs, func) {
      return function(...args) {
        return Promise.all(
          needs.map(getPromise)
        ).then(
          () => func.apply(this, args)
        );
      };
    }
  };
})(this);
