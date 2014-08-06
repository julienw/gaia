/* global Promise */
'use strict';

function TaskRunner() {
  this._currentTask = Promise.resolve();
  this._counter = 0;
  this._whenEmptyPromiseResolvers = [];
}

TaskRunner.prototype.push = function(task) {
  var decrementCounter = function decrementCounter() {
    this._counter--;
    if (!this._counter) {
      this._whenEmptyPromiseResolvers.forEach((resolve) => resolve());
      this._whenEmptyPromiseResolvers.length = 0;
    }
  }.bind(this);

  this._counter++;
  var taskPromise = this._currentTask.then(task, task).then(decrementCounter);
  return (this._currentTask = taskPromise);
};

TaskRunner.prototype.whenEmpty = function() {
  if (!this._counter) {
    return Promise.resolve();
  }

  return new Promise(function(resolve) {
    this._whenEmptyPromiseResolvers.push(resolve);
  });
};
