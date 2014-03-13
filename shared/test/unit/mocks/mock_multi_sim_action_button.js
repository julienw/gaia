/* exported MockMultiSimActionButton */

'use strict';

var MockMultiSimActionButtonSingleton = {
  isInitialized: false,
  performAction: function() {

  },
  _phoneNumberGetter: null
};

var MockMultiSimActionButton = function(button, phoneNumberGetter) {
  MockMultiSimActionButtonSingleton.isInitialized = true;
  MockMultiSimActionButtonSingleton._phoneNumberGetter = phoneNumberGetter;

  return MockMultiSimActionButtonSingleton;
};

