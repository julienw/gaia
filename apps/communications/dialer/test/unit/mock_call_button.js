/* exported MockCallButton */

'use strict';

var MockCallButtonSingleton = {
  isInitialized: false,
  makeCall: function() {

  },
  _phoneNumberGetter: null
};

var MockCallButton = function(button, phoneNumberGetter) {
  MockCallButtonSingleton.isInitialized = true;
  MockCallButtonSingleton._phoneNumberGetter = phoneNumberGetter;

  return MockCallButtonSingleton;
};

