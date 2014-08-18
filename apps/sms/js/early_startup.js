/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/*global
   MessageManager,
   ThreadListUI
*/

var EarlyStartup = {
  init: function() {
    MessageManager.init();
    ThreadListUI.renderThreads();
  }
};

EarlyStartup.init();
