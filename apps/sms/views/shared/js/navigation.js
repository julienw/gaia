/*global
  Utils
 */
(function(exports) {
  'use strict';

  const NGA_VIEWS = Object.freeze([
    Object.freeze({
      name: 'thread',
      url: 'views/conversation/index.html',
      view: 'ConversationView',
      previous: 'thread-list',
      alsoContains: ['report-view', 'composer', 'group-view']
    }),
    Object.freeze({
      name: 'thread-list',
      url: 'views/inbox/index.html',
      view: 'InboxView'
    }),
    Object.freeze({
      name: 'report-view',
      view: 'ReportView',
      previous: 'thread',
      partOf: 'thread'
    }),
    Object.freeze({
      name: 'composer',
      view: 'ConversationView',
      previous: 'thread-list',
      partOf: 'thread'
    }),
    Object.freeze({
      name: 'group-view',
      view: 'GroupView',
      previous: 'thread',
      partOf: 'thread'
    })
  ]);

  const OA_VIEWS = Object.freeze([
    Object.freeze({
      name: 'thread-list',
      url: 'index.html',
      view: 'InboxView',
      alsoContains: ['thread', 'composer', 'group-view', 'report-view']
    }),
    Object.freeze({
      name: 'thread',
      view: 'ConversationView',
      previous: 'thread-list',
      partOf: 'thread-list'
    }),
    Object.freeze({
      name: 'composer',
      view: 'ConversationView',
      previous: 'thread-list',
      partOf: 'thread-list'
    }),
    Object.freeze({
      name: 'group-view',
      view: 'GroupView',
      previous: 'thread',
      partOf: 'thread-list'
    }),
    Object.freeze({
      name: 'report-view',
      view: 'ReportView',
      previous: 'thread',
      partOf: 'thread-list'
    })
  ]);

  const VIEWS = usingOldArchitecture() ? OA_VIEWS : NGA_VIEWS;

  var currentView;

  function setLocation(url) {
    window.location.assign(url);
  }

  function usingOldArchitecture() {
    var pathname = window.location.pathname;
    return (pathname === '/' || pathname === '/index.html');
  }

  function findViewFromHash(hash) {
    if (!hash) {
      return null;
    }

    var index = hash.indexOf('/');
    if (index != -1) {
      hash = hash.slice(index + 1);
    }

    index = hash.indexOf('?');
    if (index !== -1) {
      hash = hash.slice(0, index);
    }

    return findViewFromName(hash);
  }

  function findViewFromLocation(location) {
    var pathName = location.pathname;

    var viewFromHash = findViewFromHash(location.hash);
    var viewFromPath = VIEWS.find(
      (object) => pathName.endsWith('/' + object.url)
    ) || null;

    if (viewFromHash && viewFromHash.partOf &&
        viewFromHash.partOf !== viewFromPath.name) {
      console.error(
        'The view', viewFromHash.name,
        'found from the hash', location.hash,
        'is not part of view', viewFromPath.name
      );
      viewFromHash = null;
    }

    return viewFromHash || viewFromPath;
  }

  function findViewFromName(name) {
    return VIEWS.find((object) => {
      return object.name === name;
    }) || null;
  }

  function executeNavigationStep(stepName, args) {
    var viewObject = window[currentView.view];
    if (viewObject[stepName]) {
      return Promise.resolve(viewObject[stepName](args));
    }
    return Promise.resolve();
  }

  function attachAfterEnterHandler() {
    function onNavigationEnd() {
      window.removeEventListener('navigation-transition-end', onNavigationEnd);
      window.removeEventListener('load', onNavigationEnd);
      executeNavigationStep('afterEnter');
    }

    window.addEventListener('navigation-transition-end', onNavigationEnd);
    window.addEventListener('load', onNavigationEnd); // simulate navigation end
  }

  var previousAnimationDefer;
  function waitForSlideAnimation(panelElement) {
    if (previousAnimationDefer) {
      previousAnimationDefer.reject(new Error('A new animation started'));
    }

    var defer = Utils.Promise.defer();
    previousAnimationDefer = defer;

    panelElement.addEventListener('animationend', function onAnimationEnd() {
      this.removeEventListener('animationend', onAnimationEnd);
      defer.resolve();
    });

    return defer.promise.then(() => previousAnimationDefer = null);
  }

  // hides current panel, shows new panel
  function switchPanel({oldView, newView}) {
    var doSlideAnimation = oldView && newView;
    var isGoingBack = oldView && newView && oldView.previous === newView.name;

    var oldPanelElement =
      oldView && document.querySelector(`.panel-${oldView.name}`);
    var newPanelElement =
      newView && document.querySelector(`.panel-${newView.name}`);

    if (doSlideAnimation) {
      newPanelElement.classList.add('panel-will-activate', 'panel-active');
      oldPanelElement.classList.add('panel-will-deactivate');

      newPanelElement.classList.toggle('panel-animation-back', isGoingBack);
      oldPanelElement.classList.toggle('panel-animation-back', isGoingBack);

      return waitForSlideAnimation(newPanelElement).then(() => {
        oldPanelElement.classList.remove(
          'panel-will-activate', 'panel-will-deactivate',
          'panel-active', 'panel-animation-back'
        );
        newPanelElement.classList.remove(
          'panel-will-deactivate', 'panel-will-activate', 'panel-animation-back'
        );
      }, () => {
        oldPanelElement.classList.remove(
          'panel-will-deactivate', 'panel-animation-back'
        );
        newPanelElement.classList.remove(
          'panel-will-activate', 'panel-animation-back'
        );
      });
    }

    if (oldView) {
      oldPanelElement.classList.remove('panel-active');
    }

    if (newView) {
      newPanelElement.classList.add('panel-active');
    }
  }

  function onPopState(e) {
    var oldView = currentView;
    currentView = findViewFromLocation(window.location);
    if (!currentView) {
      return;
    }

    var args = Utils.params(window.location.hash);
    executeNavigationStep('beforeLeave', args).then(
      () => executeNavigationStep('beforeEnter', args)
    ).then(
      () => switchPanel({ oldView, newView: currentView })
    ).then(
      () => executeNavigationStep('afterEnter', args)
    );
  }

  function attachHistoryListener() {
    //window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
  }

  function detachHistoryListener() {
    //window.removeEventListener('popstate', onPopState);
    window.removeEventListener('hashchange', onPopState);
  }

  exports.Navigation = {
    back() {
      return executeNavigationStep('beforeLeave').then(
        () => window.history.back()
      );
    },

    toPanel(viewName, args) {
      var view = findViewFromName(viewName);

      if (view === currentView) {
        return Promise.resolve();
      }

      var parentView;
      var nextLocation = view.url;
      var hash = '';
      if (view.partOf) {
        parentView = findViewFromName(view.partOf);
        nextLocation = parentView.url;
        hash = `#!/${viewName}`;
      }
      var currentParentView = currentView;
      if (currentView.partOf) {
        currentParentView = findViewFromName(currentView.partOf);
      }

      var beforeLeavePromise = executeNavigationStep('beforeLeave', args);

      hash = Utils.url(hash, args);
      var oldView = currentView;

      if (parentView === currentParentView) {
        // no document change
        return beforeLeavePromise.then(
          () => setLocation(hash), currentView = view
        ).then(
          () => executeNavigationStep('beforeEnter', args)
        ).then(
          () => switchPanel({ oldView, newView: view })
        ).then(
          () => executeNavigationStep('afterEnter', args)
        );
      } else {
        // document change
        return beforeLeavePromise.then(
          () => setLocation('/' + nextLocation + hash)
        );
      }
    },

    init() {
      currentView = findViewFromLocation(window.location);
      if (!currentView) {
        return;
      }

      var args = Utils.params(window.location.hash);
      executeNavigationStep('beforeEnter', args).then(
        () => switchPanel({ newView: currentView })
      );
      attachAfterEnterHandler();
      attachHistoryListener();
    },

    /* will be used by tests */
    cleanup() {
      detachHistoryListener();
    },

    isDefaultPanel() {
      if (!currentView) {
        throw new Error('CurrentView has not been found yet.');
      }
      return !currentView.partOf;
    }
  };
})(window);
