(function(exports) {
  'use strict';

  const OriginalPromise = exports.Promise;

  var promiseSet = new Set();

  var rememberPromise = function(promise) {
    var originalThen = promise.then,
        originalCatch = promise.catch;

    promise.then = function() {
      // We need to remember only the last promise in the particular chain, so
      // forgetting previous promise and remembering a new one in the chain.
      promiseSet.delete(promise);
      return rememberPromise(originalThen.apply(promise, arguments));
    };

    promise['catch'] = function() {
      promiseSet.delete(promise);
      return rememberPromise(originalCatch.apply(promise, arguments));
    };

    // Adding extension method to the modified promise that will always return
    // fulfilled promise, so that we can use both fulfilled and rejected
    // promises in single Promise.all call.
    promise['finally'] = function(rejections) {
      return originalCatch.call(promise, e => e && rejections.push(e));
    };

    promiseSet.add(promise);

    return promise;
  };

  var MockPromise = function(callback) {
    return rememberPromise(new OriginalPromise(callback));
  };

  ['resolve', 'reject', 'all', 'cast', 'race'].forEach(function(method) {
    MockPromise[method] = () => rememberPromise(
      OriginalPromise[method].apply(OriginalPromise, arguments)
    );
  });

  MockPromise.flush = function() {
    // Convert from iterable to array. Can be removed once patch for bug 952890
    // reaches at least beta channel.
    var pendingPromises = [],
        unhandledRejections = [];

    promiseSet.forEach(promise =>
      pendingPromises.push(promise.finally(unhandledRejections))
    );
    promiseSet.clear();

    return pendingPromises.length > 0 ?
      OriginalPromise.all(pendingPromises).then(() => unhandledRejections) :
      // Return empty array just for the consistency sake
      OriginalPromise.resolve(unhandledRejections);
  };

  exports.MockPromise = MockPromise;
})(window);