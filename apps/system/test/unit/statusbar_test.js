requireApp('system/js/statusbar.js');

suite('system/Statusbar', function() {
  var realL10n,
      fakeDownloadingInstallIconNode;

  suiteSetup(function() {
    realL10n = navigator.mozL10n;
    navigator.mozL10n = {
      get: function get(key, params) {
        return key;
      }
    };
  });

  suiteTeardown(function() {
    navigator.mozL10n = realL10n;
  });

  setup(function() {
    fakeDownloadingInstallIconNode = document.createElement("div");
    fakeDownloadingInstallIconNode.id = "statusbar-downloading-install";
    document.body.appendChild(fakeDownloadingInstallIconNode);

    // executing init again
    StatusBar.init();
  });
  teardown(function() {
    fakeDownloadingInstallIconNode.parentNode.removeChild(fakeDownloadingInstallIconNode);
  });

  suite("downloading-install", function() {
    test("incrementing should display the icon", function() {
      StatusBar.incActiveInstallDownloads();
      assert(!fakeDownloadingInstallIconNode.hidden);
    });
    test("incrementing then decrementing should not display the icon", function() {
      StatusBar.incActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      assert(fakeDownloadingInstallIconNode.hidden);
    });
    test("incrementing twice then decrementing once should display the icon", function() {
      StatusBar.incActiveInstallDownloads();
      StatusBar.incActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      assert(!fakeDownloadingInstallIconNode.hidden);
    });
    test("incrementing then decrementing twice should not display the icon", function() {
      StatusBar.incActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      assert(fakeDownloadingInstallIconNode.hidden);
    });

    /* JW: testing that we can't have a negative counter */
    test("incrementing then decrementing twice then incrementing should display the icon", function() {
      StatusBar.incActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      StatusBar.decActiveInstallDownloads();
      StatusBar.incActiveInstallDownloads();
      assert(!fakeDownloadingInstallIconNode.hidden);
    });
  });
});
