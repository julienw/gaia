/* global GaiaHeaderFontFit */
'use strict';

(function(exports) {
  const KNOWN_ATTRIBUTES = ['start', 'end'];

  var SimpleHeader = {
    _start: null,
    _end: null,
    attributeChanged: function(name) {
      if (!KNOWN_ATTRIBUTES.contains(name)) {
        return;
      }

      this._updateAttribute(name);

      this.renderSoon();
    },

    attachedCallback: function() {
      KNOWN_ATTRIBUTES.forEach((name) => this._updateAttribute(name));
      this._heading = this.querySelector('h1, h2, h3, h4, h5, h6');
    },

    _updateAttribute: function(name) {
      this['_' + name] = this.getAttribute(name);
    },

    render: function() {
      GaiaHeaderFontFit.reformatHeading(this._heading, {
        start: this._start,
        end: this._end
      });
    },

    renderSoon: function() {
      if (!this._renderTimeout) {
        this._renderTimeout = setTimeout(() => {
          this._renderTimeout = null;
          this.render();
        });
      }
    }
  };

  exports.SimpleHeaderElement = document.registerElement(
    'simple-header', {
      prototype: Object.create(HTMLElement.prototype, SimpleHeader)
    }
  );

})(window);
