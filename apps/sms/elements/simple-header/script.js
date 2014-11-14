/* global GaiaHeaderFontFit */
'use strict';

(function(exports) {
  const KNOWN_ATTRIBUTES = ['start', 'end'];

  const ACTION_TYPES = {
    menu: true,
    back: true,
    close: true
  };

  function mixin(base, ...prototypes) {
    var result = Object.create(base);
    prototypes.forEach((proto) => {
      for (var key in proto) {
        if (proto.hasOwnProperty(key)) {
          result[key] = proto[key];
        }
      }
    });

    return result;
  }

  var SimpleHeader = {
    _start: 0,
    _end: 0,

    createdCallback: function() {
      var root = this.createShadowRoot();
      var curDoc = document.currentScript.ownerDocument;
      var template = curDoc.getElementById('simple-header-template');
      // Copy the <template>
      var clone = document.importNode(template.content, true);

      this.els = {
        actionButton: clone.querySelector('.action-button'),
        heading: this.querySelector('h1,h2,h3,h4'),
        inner: clone.querySelector('.inner')
      };

      this.configureActionButton();

      // Append template to the Shadow Root
      root.appendChild(clone);
      this.shadowStyleHack();
    },

    attributeChangedCallback: function(name) {
      console.log('attribute callback', name);
      if (!KNOWN_ATTRIBUTES.contains(name)) {
        return;
      }

      this._updateAttribute(name);

      this.renderSoon();
    },

    attachedCallback: function() {
      console.log('attached callback');
      KNOWN_ATTRIBUTES.forEach((name) => this._updateAttribute(name));
      this.renderSoon();
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
    },

    /**
     * The Gecko platform doesn't yet have
     * `::content` or `:host`, selectors,
     * without these we are unable to style
     * user-content in the light-dom from
     * within our shadow-dom style-sheet.
     *
     * To workaround this, we clone the <style>
     * node into the root of the component,
     * so our selectors are able to target
     * light-dom content.
     *
     * @private
     */
    shadowStyleHack: function() {
      var style = this.shadowRoot.querySelector('style').cloneNode(true);
      //this.classList.add('-content', '-host');
      style.setAttribute('scoped', '');
      this.appendChild(style);
    },

    /**
     * Configure the action button based
     * on the value of the `data-action`
     * attribute.
     *
     * @private
     */
    configureActionButton: function() {
      var old = this.els.actionButton.getAttribute('icon');
      var type = this.getAttribute('action');
      var supported = this.isSupportedAction(type);
      this.els.actionButton.classList.remove('icon-' + old);
      this.els.actionButton.setAttribute('icon', type);
      this.els.inner.classList.toggle('supported-action', supported);
      if (supported) { this.els.actionButton.classList.add('icon-' + type); }
      this.els.actionButton.addEventListener(
        'click', () => this.onActionButtonClick()
      );
    },

    /**
     * Validate action against supported list.
     *
     * @private
     */
    isSupportedAction: function(action) {
      return action && ACTION_TYPES[action];
    },

    /**
     * Handle clicks on the action button.
     *
     * Fired async to allow the 'click' event
     * to finish its event path before
     * dispatching the 'action' event.
     *
     * @param  {Event} e
     * @private
     */
    onActionButtonClick: function() {
      var config = { detail: { type: this.getAttribute('action') } };
      var actionEvent = new CustomEvent('action', config);
      setTimeout(this.dispatchEvent.bind(this, actionEvent));
    }
  };

  exports.SimpleHeaderElement = document.registerElement(
    'simple-header', {
      prototype: mixin(HTMLDivElement.prototype, SimpleHeader)
    }
  );

})(window);
