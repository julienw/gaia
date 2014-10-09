/*global MocksHelper, MockL10n, loadBodyHTML, Attachment, AttachmentMenu,
         AttachmentRenderer, MimeMapper, MockMozActivity, Promise, Utils,
         AssetsHelper
*/

'use strict';

requireApp('sms/js/attachment.js');
requireApp('sms/js/attachment_renderer.js');
requireApp('sms/js/utils.js');

requireApp('sms/test/unit/mock_attachment_menu.js');
require('/shared/test/unit/mocks/mock_l10n.js');
requireApp('sms/test/unit/mock_utils.js');
requireApp('sms/test/unit/mock_moz_activity.js');
requireApp('sms/test/unit/mock_mime_mapper.js');

var MocksHelperForAttachment = new MocksHelper([
  'AttachmentMenu',
  'Utils',
  'MozActivity',
  'MimeMapper'
]).init();

suite('attachment_test.js', function() {
  MocksHelperForAttachment.attachTestHelpers();

  var testImageBlob;

  suiteSetup(function(done) {
    // this sometimes takes longer because we fetch 4 assets via XHR
    this.realMozL10n = navigator.mozL10n;
    navigator.mozL10n = MockL10n;

    AssetsHelper.generateImageBlob(1400, 1400, 'image/jpeg', 1).then((blob) => {
      done(() => {
        assert.isTrue(
          blob.size > 300 * 1024,
          'Image blob should be greater than MMS size limit'
        );
        testImageBlob = blob;
      });
    }, done);
  });

  suiteTeardown(function() {
    navigator.mozL10n = this.realMozL10n;
  });

  setup(function() {
    loadBodyHTML('/index.html');
    AttachmentMenu.init('attachment-options-menu');
  });

  teardown(function() {
    document.body.textContent = '';
  });

  test('Name property defaults to a string value', function() {
    var attachment = new Attachment(new Blob());
    assert.typeOf(attachment.name, 'string');
  });

  suite('render attachment', function() {
    var attachmentRendererMock = {
      render: function() {
        return Promise.resolve();
      },
      getAttachmentContainer: function() {}
    };

    setup(function() {
      this.sinon.stub(AttachmentRenderer, 'for', function() {
        return attachmentRendererMock;
      });
    });

    test('returns attachment container', function() {
      var attachmentContainer = document.createElement('x-container');
      this.sinon.stub(attachmentRendererMock, 'getAttachmentContainer').returns(
        attachmentContainer
      );

      var attachment = new Attachment(new Blob(), {
        name: 'Image attachment'
      });

      assert.equal(attachment.render(), attachmentContainer);
    });

    test('calls ready callback in fail and success cases', function(done) {
      var attachmentContainer = document.createElement('x-container'),
          attachmentRendererResult = Promise.resolve();

      this.sinon.stub(attachmentRendererMock, 'getAttachmentContainer').returns(
        attachmentContainer
      );

      this.sinon.stub(attachmentRendererMock, 'render', function() {
        return attachmentRendererResult;
      });

      var attachment = new Attachment(new Blob(), {
        name: 'Image attachment'
      });

      var successfulDeferred = Utils.Promise.defer();
      attachment.render(function() {
        successfulDeferred.resolve();
      });

      attachmentRendererResult = Promise.reject();

      var failedDeferred = Utils.Promise.defer();
      attachment.render(function() {
        failedDeferred.resolve();
      });

      successfulDeferred.promise.then(() => failedDeferred.promise).
        then(done, done);
    });
  });

  suite('view attachment with open activity', function() {
    setup(function() {
      this.sinon.spy(MimeMapper, 'guessTypeFromFileProperties');
      this.sinon.spy(MimeMapper, 'ensureFilenameMatchesType');
    });

    test('Open normal image attachment', function() {
      var fileName = 'jpeg_image.jpg';
      var attachment = new Attachment(testImageBlob, {
        name: fileName
      });
      var typeSpy = MimeMapper.guessTypeFromFileProperties;
      var matchSpy = MimeMapper.ensureFilenameMatchesType;
      attachment.view();
      assert.ok(typeSpy.calledWith(fileName, 'image/jpeg'));
      assert.ok(matchSpy.calledWith(fileName, typeSpy.returnValues[0]));
      assert.equal(MockMozActivity.calls.length, 1);
    });

    test('Filename has no extension', function() {
      var fileName = 'jpeg_image.jpg';
      var attachment = new Attachment(testImageBlob, {
        name: fileName
      });
      var typeSpy = MimeMapper.guessTypeFromFileProperties;
      var matchSpy = MimeMapper.ensureFilenameMatchesType;
      attachment.view();
      assert.ok(typeSpy.calledWith(fileName, 'image/jpeg'));
      assert.ok(matchSpy.calledWith(fileName, typeSpy.returnValues[0]));
      assert.equal(MockMozActivity.calls.length, 1);
    });

    test('Filename is overridden using single attachment folder', function() {
      var attachment1 = new Attachment(testImageBlob, {
        name: '/some_path/.hidden_folder/attachment1.jpg'
      });

      attachment1.view();

      assert.equal(MockMozActivity.calls.length, 1);
      assert.equal(
        MockMozActivity.calls[0].data.filename,
        'sms-attachments/attachment1.jpg'
      );

      var attachment2 = new Attachment(testImageBlob, {
        name: 'attachment2.jpg'
      });

      attachment2.view();

      assert.equal(MockMozActivity.calls.length, 2);
      assert.equal(
        MockMozActivity.calls[1].data.filename,
        'sms-attachments/attachment2.jpg'
      );

    });

    suite('Activity errors >', function() {
      var activity;
      setup(function() {
        this.sinon.spy(window, 'MozActivity');
        this.sinon.stub(window, 'alert');

        var attachment = new Attachment(testImageBlob, {
          name: 'jpeg_image.jpg'
        });

        attachment.view();

        activity = window.MozActivity.firstCall.thisValue;
      });

      test('No handler for this image', function() {
        activity.onerror.call({
          error: { name: 'NO_PROVIDER' }
        });
        sinon.assert.calledWith(window.alert, 'attachmentOpenError');
      });

      test('Activity is canceled', function() {
        activity.onerror.call({
          error: { name: 'ActivityCanceled' }
        });
        sinon.assert.notCalled(window.alert);
      });

      test('Activity is canceled (on some other environment)', function() {
        activity.onerror.call({
          error: { name: 'USER_ABORT' }
        });
        sinon.assert.notCalled(window.alert);
      });
    });
  });

  suite('clone()', function() {
    var attachment, clone;

    setup(function() {
      attachment = new Attachment(new Blob());
      clone = attachment.clone();
    });

    test('properties have the same values', function() {
      assert.deepEqual(clone, attachment);
    });

    test('modifying the clone does not modify the source', function() {
      clone.blob = new Blob();
      assert.notEqual(clone.blob, attachment.blob);
    });
  });
});

