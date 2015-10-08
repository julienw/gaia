(function(exports) {
  'use strict';

  function insertScript(src) {
    const script = document.createElement('script');
    script.src = src;

    const prom = new Promise(resolve => {
      script.addEventListener('load', () => resolve());
    });
    document.documentElement.appendChild(script);

    return prom;
  }

  exports.AsyncLoader = {
    load(...srcs) {
      return Promise.all(srcs.map(insertScript)).then(() => {});
    }
  };
})(this);
