/**
 * MochaTask manager.
 * Used to provide generator yields for mocha test.
 */
var MochaTask = (function() {
  'use strict';

  let currentGenerator,
      completeHandler,
      errorHandler;

  function clearState() {
    completeHandler = null;
    currentGenerator = null;
    errorHandler = null;
  }

  function completeIfRequired(iterationResult) {
    if (iterationResult.done) {
      // Assign references so we can clear state without messing up execution
      // order later.
      let onComplete = completeHandler;

      clearState();

      if (onComplete) {
        onComplete();
      }
    }
  }

  function handleException(e) {
    // Assign references so we can clear state without messing up execution
    // order later.
    let onError = errorHandler;

    clearState();

    if (onError) {
      onError(e);
    }
  }

  return {

    /**
     * Starts a task this will
     * effect the global state of MochaTask.
     *
     *
     * @param {Function} generator generator function.
     * @param {Function} success success callback.
     * @param {Function} error error callback receives an Error instance.
     */
    start: function(generator, success, error) {
      currentGenerator = generator;
      if (!currentGenerator.next) {
        currentGenerator = generator.call(this);
      }

      completeHandler = success;
      errorHandler = error;

      if (currentGenerator && currentGenerator.next) {
        currentGenerator.next();
      }

      return this;
    },

    /**
     * Sends next value to the generator.
     * Function may be passed to functions
     * that normally require a callback.
     *
     *    yield setTimeout(100, MochaTask.next)
     *
     * If next is called with a value it will be passed
     * to the generators send method so you can use it to
     * create this kind of code.
     *
     * var responseText = yield magicXhrMethod('GET', url, Mocha.next);
     *
     * @param {Object} value object to pass to generator.
     */
    next: function(value) {
      try {
        completeIfRequired(currentGenerator.next(value));
      } catch (e) {
        handleException(e);
      }
    },

    nextNodeStyle: function(error, value) {
      if (error) {
        try {
          completeIfRequired(currentGenerator.throw(error));
        } catch (e) {
          handleException(e);
        }
        return;
      }

      this.next(value);
    }
  };
}());
