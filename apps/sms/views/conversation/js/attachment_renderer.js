/*global Promise, Template, Utils,
         ImageUtils
*/

/* exported AttachmentRenderer */

(function(exports) {
  'use strict';
  // do not create thumbnails for too big attachments
  // (see bug 805114 for a similar issue in Gallery)
  const MAX_THUMBNAIL_GENERATION_SIZE = 10 * 1024 * 1024; // 5MB

  // Actual thumbnails size should be 10 rem (100px) * devicePixelRatio
  const THUMBNAIL_SIZE = 100 * window.devicePixelRatio;

  /**
   * A <div> container suits most of the cases where we want to display an
   * MMS attachment (= icon + file name + file size). However, drafts are a
   * specific case because they are inside an editable area.
   *
   * A <div contenteditable="false"> container would be fine for drafts but
   * Gecko does not support it at the moment, see bug 685445:
   * https://bugzilla.mozilla.org/show_bug.cgi?id=685445
   *
   * Instead of a bunch of JavaScript to manage where the caret is and what
   * to delete on backspace, the contentEditable region treats the iframe as
   * a simple block. Outside of the Compose area, a <div> container is still
   * fine -- and it's *way* faster.
   */
  const RENDERERS = {
    draft: {
      createAttachmentContainer: function() {
        var container = document.createElement('iframe');

        // The attachment's iFrame requires access to the parent document's
        // context so that URIs for Blobs created in the parent may resolve as
        // expected.
        container.setAttribute('sandbox', 'allow-same-origin');

        return container;
      },

      /**
       * Renders baseMarkup into container node (in this case iframe).
       * @param {Object} data
       * @param {String} data.markup Base attachment HTML markup. It should be
       * safely escaped in advance!
       * @param {String} data.cssClass Class that will be added to the
       * container.
       * @param {Node} attachmentContainer Attachment container node.
       * @returns {Promise.<Node>} Content container node is the container node
       * for the attachment base HTML markup that allows consumer code to
       * perform post processing DOM operations.
       */
      renderTo: function(data, attachmentContainer) {
        attachmentContainer.classList.add(data.cssClass);

        var template = Template('attachment-draft-tmpl');
        var markup = template.interpolate({
          baseURL: location.protocol + '//' + location.host + '/',
          baseHTML: data.markup,
          cssClass: data.cssClass
        }, { safe: ['baseHTML'] });

        var blob = new Blob([markup], { type: 'text/html' });
        var blobUrl = window.URL.createObjectURL(blob);

        attachmentContainer.src = blobUrl;

        return this._whenLoaded(attachmentContainer).then(function onload() {
          // do some postprocessing after it's loaded
          window.URL.revokeObjectURL(blobUrl);

          var contentDocument = attachmentContainer.contentDocument;
          var documentElement = contentDocument.documentElement;
          documentElement.lang = document.documentElement.getAttribute('lang');
          documentElement.dir = document.documentElement.getAttribute('dir');
          document.l10n.translateFragment(documentElement);

          // Attach click listeners and fire the callback when rendering is
          // complete: we can't bind `readyCallback' to the `load' event
          // listener because it would break our unit tests.
          // Bubble click events from inside the iframe.
          contentDocument.addEventListener(
            'click',
            () => attachmentContainer.click()
          );
        });
      },

      _whenLoaded: function(iframe) {
        var innerDocument = iframe.contentDocument;
        // checking for the class is a way to check that the correct content is
        // loaded. If the IFrame is inserted to the DOM before we change the
        // src, its default src about:blank is loaded and we have a body, albeit
        // a bad one.
        if (innerDocument && innerDocument.body &&
            innerDocument.body.classList.contains('attachment-draft')) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          iframe.addEventListener('load', function onload() {
            this.removeEventListener('load', onload);
            resolve();
          });
        });
      },

      /**
       * Returns the inner DOM node.
       */
      getContentContainer: function(attachmentContainer) {
        return this._whenLoaded(attachmentContainer).then(
          () => attachmentContainer.contentDocument.body
        );
      },

      setL10nAttributes: function(element, l10nId, l10nArgs) {
        document.l10n.setAttributes(
          element, l10nId, l10nArgs
        );
        // l10n library can't see changes inside iframes yet
        document.l10n.translateFragment(element);
      }
    },

    base: {
      createAttachmentContainer: function() {
        return document.createElement('div');
      },

      renderTo: function(data, attachmentContainer) {
        attachmentContainer.classList.add(data.cssClass);
        attachmentContainer.innerHTML = data.markup;

        return Promise.resolve();
      },

      getContentContainer: function(attachmentContainer) {
        return Promise.resolve(attachmentContainer);
      },

      setL10nAttributes: function(element, l10nId, l10nArgs) {
        document.l10n.setAttributes(
          element, l10nId, l10nArgs
        );
      }
    }
  };

  var AttachmentRenderer = function(attachment) {
    this._attachment = attachment;
    this._renderer = attachment.isDraft ? RENDERERS.draft : RENDERERS.base;
    this._attachmentContainer = null;
  };

  /**
   * Gets DOM node that will be container for the attachment markup. This method
   * will create new container if it wasn't before.
   * @returns {Node}
   */
  AttachmentRenderer.prototype.getAttachmentContainer = function() {
    if (!this._attachmentContainer) {
      this._attachmentContainer = this._createAttachmentContainer();
    }

    return this._attachmentContainer;
  };

  AttachmentRenderer.prototype.render = function() {
    var attachmentContainer = this.getAttachmentContainer();

    // Currently we try to extract thumbnail for image only, for the rest of
    // types (audio, video and etc.) we display default attachment placeholder.
    // Video type should be revisited with:
    // Bug 924609 - Video thumbnails previews are not showing in MMS when
    // attaching or receiving a video.

    var renderingInfo;
    if (this._attachment.type === 'img' &&
        this._attachment.size < MAX_THUMBNAIL_GENERATION_SIZE) {
      renderingInfo = {
        template: 'attachment-preview-tmpl',
        cssClass: 'preview'
      };
    } else {
      renderingInfo = {
        template: 'attachment-nopreview-tmpl',
        cssClass: 'nopreview'
      };
    }

    renderingInfo.markup = this._getBaseMarkup(renderingInfo.template);
    return this._renderer.renderTo(renderingInfo, attachmentContainer)
      .then(() => this.updateThumbnail());
  };

  AttachmentRenderer.prototype.updateFileSize = function() {
    var attachmentContainer = this.getAttachmentContainer();
    return this._renderer.getContentContainer(attachmentContainer).then(
      (contentNode) => {
        var sizeIndicator = contentNode.querySelector('.js-size-indicator');
        if (!sizeIndicator) {
          throw new Error('updateFileSize should be called after a render().');
        }

        var sizeL10n = Utils.getSizeForL10n(this._attachment.size);
        this._renderer.setL10nAttributes(
          sizeIndicator, sizeL10n.l10nId, sizeL10n.l10nArgs
        );
      }
    );
  };

  AttachmentRenderer.prototype.updateThumbnail = function() {
    var attachmentContainer = this.getAttachmentContainer();
    var contentNode = this._renderer.getContentContainer(attachmentContainer);
    var thumbnailNode = contentNode.querySelector('.thumbnail');
    var attachmentNode = contentNode.querySelector('.attachment');
    var fileNode = contentNode.querySelector('.file-name');

    if (!thumbnailNode) {
      return Promise.resolve();
    }

    return this.getThumbnail().then(
      (thumbnail) => {
        thumbnailNode.style.backgroundImage =
          'url("' + thumbnail.url + thumbnail.fragment + '")';

        // It's essential to remember real image URL to revoke it later
        window.URL.revokeObjectURL(attachmentContainer.dataset.thumbnail);
        attachmentContainer.dataset.thumbnail = thumbnail.url;

        if (this._attachment.name) {
          fileNode.removeAttribute('data-l10n-id');
          fileNode.textContent = this._attachment.name.slice(
            this._attachment.name.lastIndexOf('/') + 1
          );
        } else {
          fileNode.setAttribute('data-l10n-id', 'unnamed-attachment');
        }
      },
      () => {
        contentNode.classList.add('nopreview');
        contentNode.classList.remove('preview');
        attachmentNode.classList.add('corrupted');
      }
    );
  };

  /**
   * Extracts thumbnail for the image.
   * TODO: As we started to use mozSampleSize for thumbnail generation we need
   * to check if we still want to store this thumbnail data (indexedDB)
   * Bug 876467 - [MMS] generate, store, and reuse image thumbnails
   * @returns {Promise}
   */
  AttachmentRenderer.prototype.getThumbnail = function() {
    // The thumbnail format matches the blob format.
    var blob = this._attachment.blob;

    return ImageUtils.getSizeAndType(blob).then(
      function getSizeResolve(data) {
        var fragment = ImageUtils.Downsample.sizeNoMoreThan(
          THUMBNAIL_SIZE / Math.min(data.width, data.height)
        );

        return {
          url: window.URL.createObjectURL(blob),
          fragment: fragment
        };
      }
    );
  };

  /**
   * Creates new attachment container.
   * @returns {Node}
   */
  AttachmentRenderer.prototype._createAttachmentContainer = function() {
    var attachmentContainer = this._renderer.createAttachmentContainer();

    attachmentContainer.classList.add('attachment-container');
    attachmentContainer.dataset.attachmentType = this._attachment.type;

    return attachmentContainer;
  };

  /**
   * Returns HTML string that represents base attachment markup.
   * @param templateId Id of the template to use.
   * @param hasError Indicates whether something is wrong with attachment.
   * @returns {string}
   */
  AttachmentRenderer.prototype._getBaseMarkup = function(templateId) {
    // interpolate the #attachment-[no]preview-tmpl template
    var sizeL10n = Utils.getSizeForL10n(this._attachment.size);
    return Template(templateId).interpolate({
      type: this._attachment.type,
      sizeL10nId: sizeL10n.l10nId,
      sizeL10nArgs: JSON.stringify(sizeL10n.l10nArgs)
    });
  };

  exports.AttachmentRenderer = {
    for: function(attachment) {
      return new AttachmentRenderer(attachment);
    }
  };
}(this));
