/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/*global Template, Utils, Threads, Contacts, Threads,
         WaitingScreen, MessageManager, TimeHeaders,
         Drafts, Thread, OptionMenu, ActivityPicker,
         StickyHeader, Navigation,
         InterInstanceEventDispatcher,
         SelectionHandler,
         Settings,
         LazyLoader
*/
/*exported InboxView */
(function(exports) {
'use strict';

const privateMembers = new WeakMap();

function createBdiNode(content) {
  var bdi = document.createElement('bdi');
  bdi.textContent = content;
  return bdi;
}

var InboxView = {
  readyDeferred: Utils.Promise.defer(),

  DRAFT_SAVED_DURATION: 5000,
  FIRST_PANEL_THREAD_COUNT: 9, // counted on a Peak

  // Used to track timeouts
  timeouts: {
    onDraftSaved: null
  },

  // Used to track the current number of rendered
  // threads. Updated in InboxView.renderThreads
  count: 0,

  // Set to |true| when in edit mode
  inEditMode: false,

  init: function inbox_init() {
    this.tmpl = {
      thread: Template('messages-thread-tmpl')
    };

    // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=854413
    [
      'container', 'no-messages', 'read-unread-button',
      'check-uncheck-all-button','composer-link',
      'delete-button', 'edit-header','options-button',
      'settings-button','edit-mode', 'edit-form',
      'draft-saved-banner'
    ].forEach(function(id) {
      this[Utils.camelCase(id)] = document.getElementById('threads-' + id);
    }, this);

    this.mainWrapper = document.getElementById('main-wrapper');

    // TODO this should probably move to a "WrapperView" class
    this.composerLink.addEventListener(
      'click', this.launchComposer.bind(this)
    );

    this.readUnreadButton.addEventListener('click', () => {
      this.markReadUnread(
        this.selectionHandler.selectedList,
        this.readUnreadButton.dataset.action === 'mark-as-read'
      );
    });

    this.deleteButton.addEventListener('click', () => {
      this.delete(this.selectionHandler.selectedList);
    });

    this.editHeader.addEventListener(
      'action', this.cancelEdit.bind(this)
    );

    this.optionsButton.addEventListener(
      'click', this.showOptions.bind(this)
    );

    this.settingsButton.addEventListener(
      'click', function oSettings() {
        ActivityPicker.openSettings();
      }
    );

    this.container.addEventListener(
      'click', this
    );

    this.container.addEventListener(
      'contextmenu', this
    );

    this.editForm.addEventListener(
      'submit', this
    );

    navigator.mozContacts.addEventListener(
      'contactchange',
      this.updateContactsInfo.bind(this)
    );

    MessageManager.on('message-sending', this.onMessageSending.bind(this));
    MessageManager.on('message-received', this.onMessageReceived.bind(this));
    MessageManager.on('threads-deleted', this.onThreadsDeleted.bind(this));

    Drafts.on('deleted', this.onDraftDeleted.bind(this));
    Drafts.on('saved', this.onDraftSaved.bind(this));

    InterInstanceEventDispatcher.on(
      'drafts-changed',
      this.renderDrafts.bind(this, true /* force update */)
    );

    privateMembers.set(this, {
      // Very approximate number of letters that can fit into title for the
      // group thread, "100" is for all paddings, image width and so on,
      // 10 is approximate English char width for current 18px font size
      groupThreadTitleMaxLength: (window.innerWidth - 100) / 10
    });

    this.sticky = null;
  },

  initStickyHeader: function inbox_initStickyHeader() {
    if (!this.sticky) {
      this.sticky =
        new StickyHeader(this.container, document.getElementById('sticky'));
    }
  },

  beforeEnter: function inbox_beforeEnter(args) {
    // If user left Conversation or New Message views saving a draft, let's
    // unobtrusively notify him that draft is successfully saved.
    if (args.notifyAboutSavedDraft) {
      this.showDraftSavedBanner();
    }
  },

  beforeLeave: function inbox_beforeLeave() {
    // This should be in afterLeave, but the edit mode interface does not seem
    // to slide correctly. Bug 1009541
    this.cancelEdit();
  },

  getIdIterator: function inbox_getIdIterator() {
    return Threads.keys();
  },

  setContact: function inbox_setContact(node) {
    var threadId = node.dataset.threadId;
    var draftId = node.dataset.draftId;

    var threadOrDraft = draftId ?
      Drafts.byDraftId(+draftId) : Threads.get(+threadId);

    if (!threadOrDraft) {
      throw new Error('Thread node is invalid!');
    }

    var threadNumbers = threadOrDraft.participants || threadOrDraft.recipients;

    var titleContainer = node.querySelector('.threadlist-item-title');
    var title = titleContainer.firstElementChild;
    var picture = node.querySelector('.threadlist-item-picture');

    if (!threadNumbers || !threadNumbers.length) {
      title.setAttribute('data-l10n-id', 'no-recipient');
      return;
    }

    function* updateThreadNode(number) {
      var contact = yield InboxView.findContact(number, { photo: true });
      var isContact = !!contact.isContact;

      picture.classList.toggle('has-picture', isContact);
      picture.classList.toggle(
        'default-picture', isContact && !contact.photo
      );

      title.textContent = contact.title || number;

      var photoUrl = node.dataset.photoUrl;
      if (photoUrl) {
        window.URL.revokeObjectURL(photoUrl);
      }

      if (contact.photo) {
        photoUrl = window.URL.createObjectURL(contact.photo);
      } else if (photoUrl) {
        photoUrl = '';
      }

      node.dataset.photoUrl = photoUrl;

      if (photoUrl) {
        // Use multiple image background to display default image until real
        // contact image thumbnail is decoded by Gecko. Difference is especially
        // noticeable on slow devices. Please keep default image in sync with
        // what defined in CSS (sms.css/.threadlist-item-picture)
        picture.firstElementChild.style.backgroundImage = [
          'url(' + photoURL + ')',
          'url(/views/inbox/style/images/default_contact_image.png)'
        ].join(', ');
      } else {
        picture.firstElementChild.style.backgroundImage = null;
      }
    }

    function* updateGroupThreadNode(numbers, titleMaxLength) {
      var contactTitle, number;
      var i = 0;
      var threadTitleLength = 0;

      var groupTitle = document.createElement('span');
      var separatorNode = document.createElement('span');
      separatorNode.setAttribute(
        'data-l10n-id',
        'thread-participant-separator'
      );

      picture.firstElementChild.textContent = numbers.length;
      picture.classList.add('has-picture', 'group-picture');

      while (i < numbers.length && threadTitleLength < titleMaxLength) {
        number = numbers[i++];

        contactTitle = (yield InboxView.findContact(number)).title || number;

        if (threadTitleLength > 0) {
          groupTitle.appendChild(separatorNode.cloneNode(true));
        }
        groupTitle.appendChild(createBdiNode(contactTitle));

        threadTitleLength += contactTitle.length;
      }

      titleContainer.replaceChild(groupTitle, title);
    }

    if (threadNumbers.length === 1) {
      return Utils.Promise.async(updateThreadNode)(threadNumbers[0]);
    }

    return Utils.Promise.async(updateGroupThreadNode)(
      threadNumbers, privateMembers.get(this).groupThreadTitleMaxLength
    );
  },

  findContact: function(number, options) {
    return Contacts.findByAddress(number).then(function(contacts) {
      var details = Utils.getContactDetails(number, contacts, options);

      if (!details.isContact) {
        Contacts.addUnknown(number);
      }

      return details;
    });
  },

  handleEvent: function inbox_handleEvent(event) {
    var parent = event.target.parentNode;
    var threadId = parent.dataset.threadId;

    switch (event.type) {
      case 'click':
        // Handle selection in selection module
        if (this.inEditMode) {
          return;
        }

        if (threadId) {
          event.preventDefault();

          var draftId = parent.dataset.draftId;
          if (draftId) {
            Navigation.toPanel('composer', {
              draftId: +draftId
            });
          } else {
            Navigation.toPanel('thread', {
              id: +threadId
            });
          }
        }

        break;
      case 'contextmenu':
        if (this.inEditMode || !threadId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        // Show options per single thread
        var params = {
          type: 'action',
          header: { l10nId: 'thread-options' },
          items: [{
            l10nId: 'delete-thread',
            method: this.delete.bind(this, [threadId])
          }]
        };

        var thread = Threads.get(+threadId);

        if (!thread.isDraft) {
          var isRead = thread.unreadCount > 0;
          var l10nKey = isRead ? 'mark-as-read' : 'mark-as-unread';

          params.items.push(
            {
              l10nId: l10nKey,
              method: this.markReadUnread.bind(this, [threadId], isRead)
            }
          );
        }

        params.items.push({
          l10nId: 'cancel'
        });

        var options = new OptionMenu(params);
        options.show();

        break;
      case 'submit':
        event.preventDefault();
        break;
    }
  },

  launchComposer: function inbox_launchComposer(e) {
    // prevent following the link, see also bug 1014219
    e.preventDefault();
    Navigation.toPanel('composer');
  },

  updateSelectionStatus: function inbox_updateSelectionStatus() {
    var selected = this.selectionHandler;

    if (this.selectionHandler.allSelected()) {
      this.checkUncheckAllButton.setAttribute('data-l10n-id', 'deselect-all');
    } else {
      this.checkUncheckAllButton.setAttribute('data-l10n-id', 'select-all');
    }
    if (selected.selectedCount) {
      this.deleteButton.disabled = false;
      navigator.mozL10n.setAttributes(this.editMode, 'selected-threads', {
        n: selected.selectedCount
      });

      var hasUnreadselected = selected.selectedList.some((id) => {
        var thread  = Threads.get(id);

        if (thread && thread.unreadCount) {
          return thread.unreadCount > 0;
        }
        return false;
      });

      var allDraft = selected.selectedList.every((id) => {
        return (Threads.get(id).isDraft);
      });

      if (allDraft) {
        this.readUnreadButton.disabled = true;
      } else {
        if (!hasUnreadselected) {
          this.readUnreadButton.dataset.action = 'mark-as-unread';
        } else {
          this.readUnreadButton.dataset.action = 'mark-as-read';
        }
        this.readUnreadButton.disabled = false;
      }

    } else {
      this.deleteButton.disabled = true;
      this.readUnreadButton.disabled = true;
      navigator.mozL10n.setAttributes(this.editMode, 'selectThreads-title');
    }
  },

  markReadUnread: function inbox_markReadUnread(selected, isRead) {
    selected.forEach((id) => {
      var thread = Threads.get(+id);

      var markable = thread && !thread.isDraft &&
        (isRead || !thread.getDraft());

      if (markable) {
        thread.unreadCount = isRead ? 0 : 1;
        this.mark(thread.id, isRead ? 'read' : 'unread');

        MessageManager.markThreadRead(thread.id, isRead);
      }
    });

    this.cancelEdit();
  },

  removeThread: function inbox_removeThread(threadId) {
    var li = document.getElementById('thread-' + threadId);
    var parent;
    var photoUrl = li && li.dataset.photoUrl;

    // Revoke the contact photo while deletion for avoiding intermittent
    // photo disappear issue.
    if (photoUrl) {
      window.URL.revokeObjectURL(photoUrl);
    }

    if (li) {
      parent = li.parentNode;
      li.remove();
    }

    // remove the header and the ul for an empty list
    if (parent && !parent.firstElementChild) {
      parent.previousSibling.remove();
      parent.remove();

      this.sticky && this.sticky.refresh();

      // if we have no more elements, set empty classes
      if (!this.container.querySelector('li')) {
        this.setEmpty(true);
      }
    }
  },

  // Since removeThread will revoke list photoUrl at the end of deletion,
  // please make sure url will also be revoked if new delete api remove threads
  // without calling removeThread in the future.
  delete: function inbox_delete(selected) {
    function performDeletion() {
    /* jshint validthis: true */

      var threadIdsToDelete = [],
          messageIdsToDelete = [],
          threadCountToDelete = 0;

      function exitEditMode() {
        InboxView.cancelEdit();
        WaitingScreen.hide();
      }

      function onAllThreadMessagesRetrieved() {
        if (!--threadCountToDelete) {
          MessageManager.deleteMessages(messageIdsToDelete);

          threadIdsToDelete.forEach(function(threadId) {
            InboxView.deleteThread(threadId);
          });

          messageIdsToDelete = threadIdsToDelete = null;

          exitEditMode();
        }
      }

      function onThreadMessageRetrieved(message) {
        messageIdsToDelete.push(message.id);
        return true;
      }

      WaitingScreen.show();

      threadIdsToDelete = selected.reduce(function(list, value) {
        // Coerce the threadId back to a number MobileMessageFilter and all
        // other platform APIs expect this value to be a number.
        var threadId = +value;

        if (Threads.get(threadId).isDraft) {
          InboxView.deleteThread(threadId);
        } else {
          list.push(threadId);
        }

        return list;
      }, []);

      if (!threadIdsToDelete.length) {
        exitEditMode();
        return;
      }

      threadCountToDelete = threadIdsToDelete.length;

      threadIdsToDelete.forEach(function(threadId) {
        MessageManager.getMessages({
          // Filter and request all messages with this threadId
          filter: { threadId: threadId },
          each: onThreadMessageRetrieved,
          end: onAllThreadMessagesRetrieved
        });
      });
    }

    return Utils.confirm(
      {
        id: 'deleteThreads-confirmation-message',
        args: { n: selected.length }
      },
      null,
      {
        text: 'delete',
        className: 'danger'
      }
    ).then(performDeletion.bind(this));
  },

  setEmpty: function inbox_setEmpty(empty) {
    var panel = document.getElementById('thread-list');

    // Hide the container when threadlist is empty.
    panel.classList.toggle('threadlist-is-empty', !!empty);
  },

  showOptions: function inbox_options() {
    var params = {
      items: [{
        l10nId: 'selectThreads-label',
        method: this.startEdit.bind(this)
      },{
        l10nId: 'settings',
        method: function oSettings() {
          ActivityPicker.openSettings();
        }
      },{ // Last item is the Cancel button
        l10nId: 'cancel',
        incomplete: true
      }]
    };

    new OptionMenu(params).show();
  },

  startEdit: function inbox_edit() {
    function editModeSetup() {
      /*jshint validthis:true */
      this.inEditMode = true;
      this.selectionHandler.cleanForm();
      this.mainWrapper.classList.toggle('edit');
    }

    if (!this.selectionHandler) {
      LazyLoader.load('/views/shared/js/selection_handler.js', () => {
        this.selectionHandler = new SelectionHandler({
          // Elements
          container: this.container,
          checkUncheckAllButton: this.checkUncheckAllButton,

          // Methods
          updateSelectionStatus: this.updateSelectionStatus.bind(this),
          getIdIterator: this.getIdIterator.bind(this),
          isInEditMode: this.isInEditMode.bind(this)
        });
        editModeSetup.call(this);
      });
    } else {
      editModeSetup.call(this);
    }
  },

  isInEditMode: function inbox_isInEditMode() {
    return this.inEditMode;
  },

  cancelEdit: function inbox_cancelEdit() {
    this.inEditMode = false;
    this.mainWrapper.classList.remove('edit');
  },

  renderDrafts: function inbox_renderDrafts(force) {
    // Request and render all threads with drafts
    // or thread-less drafts.
    return Drafts.request(force).then(() => {
      for (var draft of Drafts.getAll()) {
        if (draft.threadId) {
          // Find draft-containing threads that have already been rendered
          // and update them so they mark themselves appropriately
          if (document.getElementById(`thread-${draft.threadId}`)) {
            this.updateThread(Threads.get(draft.threadId));
          }
        } else {
          // Safely assume there is a threadless draft
          this.setEmpty(false);

          // Render draft only in case we haven't rendered it yet.
          if (!Threads.has(draft.id)) {
            var thread = Thread.fromDraft(draft);
            Threads.set(draft.id, thread);
            this.appendThread(thread);
          }
        }
      }

      this.sticky && this.sticky.refresh();
    });
  },

  prepareRendering: function inbox_prepareRendering() {
    this.container.innerHTML = '';
    this.renderDrafts();
  },

  startRendering: function inbox_startRenderingThreads() {
    this.setEmpty(false);
  },

  finalizeRendering: function inbox_finalizeRendering(empty) {
    if (empty) {
      this.setEmpty(true);
    }

    if (!empty) {
      TimeHeaders.updateAll('header[data-time-update]');
    }

    this.sticky && this.sticky.refresh();
  },

  ensureReadAheadSetting: function inbox_ensureReadAheadSettting() {
    Settings.setReadAheadThreadRetrieval(this.FIRST_PANEL_THREAD_COUNT);
  },

  renderThreads: function inbox_renderThreads(firstViewDoneCb) {
    window.performance.mark('willRenderThreads');

    var hasThreads = false;
    var firstPanelCount = this.FIRST_PANEL_THREAD_COUNT;

    this.prepareRendering();

    var firstViewDone = function firstViewDone() {
      this.initStickyHeader();

      if (typeof firstViewDoneCb === 'function') {
        firstViewDoneCb();
      }
    }.bind(this);

    function onRenderThread(thread) {
      /* jshint validthis: true */
      // Register all threads to the Threads object.
      Threads.set(thread.id, thread);

      if (!hasThreads) {
        hasThreads = true;
        this.startRendering();
      }

      this.appendThread(thread);
      if (--firstPanelCount === 0) {
        // dispatch visuallyLoaded and contentInteractive when rendered
        // threads could fill up the top of the visible area
        window.performance.mark('visuallyLoaded');
        firstViewDone();
      }
    }

    function onThreadsRendered() {
      /* jshint validthis: true */

      /* We set the view as empty only if there's no threads and no drafts,
       * this is done to prevent races between renering threads and drafts. */
      this.finalizeRendering(!(hasThreads || Drafts.size));

      if (firstPanelCount > 0) {
        // dispatch visuallyLoaded and contentInteractive when rendering
        // ended but threads could not fill up the top of the visible area
        window.performance.mark('visuallyLoaded');
        firstViewDone();
      }
    }

    function onDone() {
      /* jshint validthis: true */

      this.readyDeferred.resolve();

      this.ensureReadAheadSetting();
    }

    MessageManager.getThreads({
      each: onRenderThread.bind(this),
      end: onThreadsRendered.bind(this),
      done: onDone.bind(this)
    });

    return this.readyDeferred.promise;
  },

  createThread: function inbox_createThread(record) {
    // Create DOM element
    var li = document.createElement('li');
    var timestamp = +record.timestamp;
    var type = record.lastMessageType;
    var participants = record.participants;
    var number = participants[0];
    var id = record.id;
    var bodyHTML = record.body;
    var thread = Threads.get(id);
    var iconLabel = '';

    // A new conversation "is" a draft
    var isDraft = thread.isDraft;

    // A an existing conversation has draft.
    var draft = thread.getDraft();

    if (!isDraft && draft) {
      timestamp = Math.max(draft.timestamp, timestamp);
      // If the draft is newer than the message, update
      // the body with the draft content's first string.
      if (draft.timestamp >= record.timestamp) {
        bodyHTML = draft.content.find(function(content) {
          if (typeof content === 'string') {
            return true;
          }
        });
        type = draft.type;
      }
    }

    bodyHTML = Template.escape(bodyHTML || '');

    li.id = 'thread-' + id;
    li.dataset.threadId = id;
    li.dataset.time = timestamp;
    li.dataset.lastMessageType = type;
    li.classList.add('threadlist-item');

    if (draft) {
      // Set the "draft" visual indication
      li.classList.add('draft');

      if (isDraft) {
        li.dataset.draftId = draft.id;
        li.classList.add('is-draft');
        iconLabel = 'is-draft';
      } else {
        li.classList.add('has-draft');
        iconLabel = 'has-draft';
      }
    }

    if (record.unreadCount > 0) {
      li.classList.add('unread');
      iconLabel = 'unread-thread';
    }

    // Render markup with thread data
    li.innerHTML = this.tmpl.thread.interpolate({
      hash: isDraft ? '#composer' : '#thread=' + id,
      mode: isDraft ? 'drafts' : 'threads',
      id: isDraft ? draft.id : id,
      number: number,
      bodyHTML: bodyHTML,
      timestamp: String(timestamp),
      iconLabel: iconLabel
    }, {
      safe: ['id', 'bodyHTML']
    });

    TimeHeaders.update(li.querySelector('time'));

    return li;
  },

  deleteThread: function(threadId) {
    // Threads.delete will handle deleting
    // any Draft objects associated with the
    // specified threadId.
    Threads.delete(threadId);

    // Cleanup the DOM
    this.removeThread(threadId);

    // Remove notification if exist
    Utils.closeNotificationsForThread(threadId);
  },

  insertThreadContainer:
    function inbox_insertThreadContainer(group, timestamp) {
    // We look for placing the group in the right place.
    var headers = InboxView.container.getElementsByTagName('header');
    var groupFound = false;
    for (var i = 0; i < headers.length; i++) {
      if (timestamp >= headers[i].dataset.time) {
        groupFound = true;
        InboxView.container.insertBefore(group, headers[i].parentNode);
        break;
      }
    }
    if (!groupFound) {
      InboxView.container.appendChild(group);
    }
  },

  updateThread: function inbox_updateThread(record, options) {
    var thread = Thread.create(record, options);
    var threadUINode = document.getElementById('thread-' + thread.id);
    var threadUITime = threadUINode ? +threadUINode.dataset.time : NaN;
    var recordTime = +thread.timestamp;

    Threads.set(thread.id, thread);

    // Edge case: if we just received a message that is older than the latest
    // one in the thread, we only need to update the 'unread' status.
    var newMessageReceived = options && options.unread;
    if (newMessageReceived && threadUITime > recordTime) {
      this.mark(thread.id, 'unread');
      return;
    }

    // If we just deleted messages in a thread but kept the last message
    // unchanged, we don't need to update the thread UI.
    var messagesDeleted = options && options.deleted;
    if (messagesDeleted && threadUITime === recordTime) {
      return;
    }

    // General case: update the thread UI.
    if (threadUINode) {
      // remove the current thread node in order to place the new one properly
      this.removeThread(thread.id);
    }

    this.setEmpty(false);
    if (this.appendThread(thread)) {
      this.sticky && this.sticky.refresh();
    }
  },

  onMessageSending: function inbox_onMessageSending(e) {
    this.updateThread(e.message);
  },

  onMessageReceived: function inbox_onMessageReceived(e) {
    // If user currently in the same thread, then mark thread as read
    var markAsRead = Navigation.isCurrentPanel('thread', {
      id: e.message.threadId
    });

    this.updateThread(e.message, { unread: !markAsRead });
  },

  onThreadsDeleted: function inbox_onThreadDeleted(e) {
    e.ids.forEach(function(threadId) {
      if (Threads.has(threadId)) {
        this.deleteThread(threadId);
      }
    }, this);
  },

  /**
   * Append a thread to the global threads container. Creates a time container
   * (i.e. for a day or some other time period) for this thread if it doesn't
   * exist already.
   *
   * @return Boolean true if a time container was created, false otherwise
   */
  appendThread: function inbox_appendThread(thread) {
    if (navigator.mozL10n.readyState !== 'complete') {
      navigator.mozL10n.once(this.appendThread.bind(this, thread));
      return;
    }

    var timestamp = +thread.timestamp;
    var draft = Drafts.byThreadId(thread.id);
    var firstThreadInContainer = false;

    if (draft) {
      timestamp = Math.max(draft.timestamp, timestamp);
    }

    // We create the DOM element of the thread
    var node = this.createThread(thread);

    // Update info given a number
    this.setContact(node);

    // Is there any container already?
    var threadsContainerID = 'threadsContainer_' +
                              Utils.getDayDate(timestamp);
    var threadsContainer = document.getElementById(threadsContainerID);
    // If there is no container we create & insert it to the DOM
    if (!threadsContainer) {
      // We create the wrapper with a 'header' & 'ul'
      var threadsContainerWrapper =
        InboxView.createThreadContainer(timestamp);
      // Update threadsContainer with the new value
      threadsContainer = threadsContainerWrapper.childNodes[1];
      // Place our new content in the DOM
      InboxView.insertThreadContainer(threadsContainerWrapper, timestamp);
      // We had to create a container, so this will be the first thread in it.
      firstThreadInContainer = true;
    }

    // Where have I to place the new thread?
    var threads = threadsContainer.getElementsByTagName('li');
    var threadFound = false;
    for (var i = 0, l = threads.length; i < l; i++) {
      if (timestamp > threads[i].dataset.time) {
        threadFound = true;
        threadsContainer.insertBefore(node, threads[i]);
        break;
      }
    }

    if (!threadFound) {
      threadsContainer.appendChild(node);
    }

    if (this.inEditMode) {
      // Remove the new added thread id from the selection handler
      this.selectionHandler.unselect(thread.id);

      this.updateSelectionStatus();
    }

    return firstThreadInContainer;
  },

  // Adds a new grouping header if necessary (today, tomorrow, ...)
  createThreadContainer: function inbox_createThreadContainer(timestamp) {
    var threadContainer = document.createElement('div');
    // Create Header DOM Element
    var headerDOM = document.createElement('header');

    // The id is used by the sticky header code as the -moz-element target.
    headerDOM.id = 'header_' + timestamp;

    // Append 'time-update' state
    headerDOM.dataset.timeUpdate = 'repeat';
    headerDOM.dataset.time = timestamp;
    headerDOM.dataset.dateOnly = true;

    // Create UL DOM Element
    var threadsContainerDOM = document.createElement('ul');
    threadsContainerDOM.id = 'threadsContainer_' +
                              Utils.getDayDate(timestamp);
    // Add text
    headerDOM.innerHTML = Utils.getHeaderDate(timestamp);

    // Add to DOM all elements
    threadContainer.appendChild(headerDOM);
    threadContainer.appendChild(threadsContainerDOM);
    return threadContainer;
  },

  // Method for updating all contact info after creating a contact
  updateContactsInfo: function inbox_updateContactsInfo() {
    Contacts.clearUnknown();
    // Prevents cases where updateContactsInfo method is called
    // before InboxView.container exists (as observed by errors
    // in the js console)
    if (!this.container) {
      return;
    }
    // Retrieve all 'li' elements
    var threads = this.container.getElementsByTagName('li');

    [].forEach.call(threads, this.setContact.bind(this));
  },

  mark: function inbox_mark(id, current) {
    var li = document.getElementById('thread-' + id);
    var remove = 'read';

    if (current === 'read') {
      remove = 'unread';
    }

    if (li) {
      li.classList.remove(remove);
      li.classList.add(current);
    }
  },

  onDraftDeleted: function inbox_onDraftDeleted(draft) {
    var thread = Threads.get(draft.threadId || draft.id);

    if (!thread) {
      return;
    }

    if (thread.isDraft) {
      this.removeThread(thread.id);
    } else {
      this.updateThread(thread);
    }
  },

  onDraftSaved: function inbox_onDraftSaved(draft) {
    var threadToUpdate = draft.threadId ? Threads.get(draft.threadId) : draft;
    this.updateThread(threadToUpdate);
  },

  showDraftSavedBanner: function() {
    this.draftSavedBanner.classList.remove('hide');

    clearTimeout(this.timeouts.onDraftSaved);
    this.timeouts.onDraftSaved = null;

    this.timeouts.onDraftSaved = setTimeout(function hideDraftSavedBanner() {
      this.draftSavedBanner.classList.add('hide');
    }.bind(this), this.DRAFT_SAVED_DURATION);
  },

  whenReady: function() {
    return this.readyDeferred.promise;
  }
};

exports.InboxView = InboxView;

}(this));
