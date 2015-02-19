/*global
  Defer
 */

'use strict';

(function(exports) {
  function AddOnModule(name, actions, onContribute) {
    this.name = name;
    this.actions = actions;
    this.onContribute = onContribute;
    this.contributors = [];
  }

  AddOnModule.prototype = {
    /* called by addons */
    contribute: function(actions) {
      for (var key in actions) {
        if (!this.actions.contains(key)) {
          throw new Error('The action ' + key + ' is unexpected.');
        }
      }

      this.contributors.push(actions);
      this.onContribute && this.onContribute(actions);
    },

    /* called by internal modules */
    callAction: function(action, ...args) {
      this.contributors.forEach((contributor) => {
        contributor[action] && contributor[action](...args);
      });
    }
  };

  function AddOnManager() {
    this.modules = {};
    this.defers = {};
  }

  AddOnManager.prototype = {
    /* called by addons */
    when: function(module) {
      if (this.modules[module]) {
        return Promise.resolve(this.modules[module]);
      }

      var defer = this.defers[module] = this.defers[module] || new Defer();
      return defer.promise;
    },

    /* internal API */
    contribute: function(module, actions) {
      if (this.modules[module]) {
        throw new Error('Module ' + module + ' already exists.');
      }

      this.modules[module] = new AddOnModule(module, actions);

      if (this.defers[module]) {
        this.defers[module].resolve(this.modules[module]);
      }

      return this.modules[module];
    }
  };

  exports.addOnManager = new AddOnManager();
})(window);
