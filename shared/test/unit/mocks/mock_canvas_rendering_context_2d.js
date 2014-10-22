console.time("mock_canvas_rendering_context_2d.js");
'use strict';

(function(exports) {
  var MockCanvasRenderingContext2D = function() {
    this.width = null;
    this.height = null;
    return this;
  };

  MockCanvasRenderingContext2D.prototype = {
    drawImage: function mcrc2_drawImage() {
    },
    getImageData: function mcrc2_getImageData() {
    },
  };

  exports.MockCanvasRenderingContext2D = MockCanvasRenderingContext2D;
})(window);
console.timeEnd("mock_canvas_rendering_context_2d.js");
