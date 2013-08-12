'use strict';

var dynamicIframe;

function handleButtonPress() {
  dynamicIframe.src = 'https://www.mozilla.org/privacy/firefox-os/';
}

function init() {
  var iframe = document.createElement('iframe');
  iframe.setAttribute('mozbrowser', 'mozbrowser');
  iframe.src = 'https://www.mozilla.org/privacy/firefox-os/';
  document.body.appendChild(iframe);

  var button = document.createElement('button');
  button.textContent = 'press me please';
  button.addEventListener('click', handleButtonPress);
  document.body.appendChild(button);

  dynamicIframe = document.createElement('iframe');
  dynamicIframe.setAttribute('mozbrowser', 'true');
  dynamicIframe.setAttribute('mozasyncpanzoom', 'true');
  //iframe.src = 'about:blank';
  document.body.appendChild(dynamicIframe);
}

init();
