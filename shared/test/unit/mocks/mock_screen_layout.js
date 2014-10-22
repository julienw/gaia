console.time("mock_screen_layout.js");
'use strict';

var _currentLayout;

var MockScreenLayout = {
  getCurrentLayout: function(layout) {
    return _currentLayout === layout;
  },

  watch: function(name, media) {
  },
  
  setCurrentLayout: function(currentLayout) {
    _currentLayout = currentLayout;
  }
};

window.ScreenLayout = MockScreenLayout;
console.timeEnd("mock_screen_layout.js");
