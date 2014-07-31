/* global
  Attention,
  MockNotifications,
  MocksHelper,
  Utils
*/

'use strict';

require('/shared/test/unit/mocks/mock_notification.js');
require('/test/unit/mock_utils.js');

require('/js/attention/attention.js');

var mocksHelperForAttention = new MocksHelper([
  'Notification',
  'Utils'
]);


suite('Network Alerts - Attention Screen', function() {
  var title, body, style;

  mocksHelperForAttention.attachTestHelpers();

  setup(function() {
    loadBodyHTML('/attention.html');

    title = 'some title';
    body = 'some body';
    style = 'fullpage';

    this.sinon.stub(Utils, 'parseParams').returns({
      title: title,
      body: body,
      style: style
    });

    Attention.init();
    Attention.render();
  });

  test('form is properly displayed', function() {
    assert.ok(
      document.body.classList.contains(style),
      'Requested style is used'
    );

    assert.equal(
      document.querySelector('h1').textContent, title,
      'The title is properly displayed'
    );
    assert.equal(
      document.querySelector('p').textContent, body,
      'The body is properly displayed'
    );
  });


  test('click button: sends notification, closes window', function(done) {
    this.sinon.stub(window, 'close', () => done());

    document.querySelector('button').click();

    assert.equal(MockNotifications[0].title, title);
    assert.equal(MockNotifications[0].body, body);
    assert.ok(MockNotifications[0].icon.endsWith('style=' + style));

    MockNotifications[0].onshow();
  });

  test('display from notification, click button:', function(done) {
    this.sinon.stub(window, 'close', () => done());

    Utils.parseParams.returns({
      title: title,
      body: body,
      style: style,
      notification: 1
    });

    document.querySelector('button').click();

    assert.isUndefined(
      MockNotifications[0],
      'should not send a new notification'
    );
  });

});
