'use strict';

var View = require('./view');

function Week() {
  View.apply(this, arguments);
}
module.exports = Week;

var hourHeight = 50;

Week.prototype = {
  __proto__: View.prototype,

  selector: '#week-view',

  get sideBarHours() {
    return this.findElements('.md__sidebar .md__hour .md__display-hour');
  },

  get events() {
    return this.findElements('.md__event');
  },

  get addEventButton() {
    return this.findElement('.md__add-event');
  },

  get todayDates() {
    return this.findElements('.md__sticky .md__allday h1.is-today');
  },

  get dayNames() {
    return this.findElements('.md__day-name').map(function(el) {
      return el.text();
    });
  },

  get daysHolder() {
    return this.findElement('.md__days');
  },

  get days() {
    return this.findElements('.md__day');
  },

  get hours() {
    return this.findElements('.md__hour');
  },

  get currentTime() {
    return this.findElement('.md__current-time');
  },

  get currentHour() {
    var now = new Date();
    return this.findElement('.md__hour-'+ now.getHours());
  },

  get currentDisplayHour() {
    return this.currentHour.findElement('.md__display-hour');
  },

  get main() {
    return this.findElement('.md__main');
  },

  get allDayIcon() {
    return this.findElement('.md__all-day');
  },

  get activeAllDays() {
    return this.findElements('.md__allday[aria-hidden="false"]');
  },

  get allDaysHolder() {
    return this.findElement('.md__alldays');
  },

  get scrollTop() {
    return this.main.scriptWith(function(el) {
      return el.scrollTop;
    });
  },

  _isHourDisplayed: function(hour) {
    return this._cmpHourDisplayed(hour) === 0;
  },

  /**
   * @returns 0 if it's displayed, -1 if it's above, +1 if it's below
   */
  _cmpHourDisplayed: function(hour) {
    var hourElt = this.hours[hour];
    var mainScroll = this.scrollTop;
    var hourOffset = hourElt.scriptWith(function(el) { return el.offsetTop; });
    var mainClientHeight = this.main.rect().height;
    var hourHeight = hourElt.rect().height;

    if (hourOffset < mainScroll) {
      return -1;
    }
    if ((hourOffset + hourHeight) > (mainScroll + mainClientHeight)) {
      return 1;
    }
    return 0;
  },

  _waitForNoScroll: function() {
    var prevScrollTop = null;
    this.client.waitFor(function() {
      var currentScrollTop = this.scrollTop;
      if (prevScrollTop !== null && prevScrollTop === currentScrollTop) {
        return true;
      }
      prevScrollTop = currentScrollTop;
      return false;
    }.bind(this));
  },

  scrollToHour: function(hour) {
    if (this._isHourDisplayed(hour)) {
      return;
    }

    this.client.waitFor(function() {
      var where = this._cmpHourDisplayed(hour);
      console.log(where);
      if (where === 0) {
        return true;
      }

      // element is hidden above the visible part
      // we need to move it up
      if (where < 0) {
        this.actions.flick(
          this.element,
          100, 10, 100, 50
        ).perform();
      }
      // element is hidden below the visible part.
      // we need to move it down
      if (where > 0) {
        this.actions.flick(
          this.element,
          100, 50, 100, 10
        ).perform();
      }

      this._waitForNoScroll();
      return false;
    }.bind(this));
  },

  tapDayHour: function(dayElt, hour) {
    //this.scrollToHour(hour);

    var top = hourHeight * hour;

    console.log(top);
    console.log(dayElt.displayed());
    console.log(this.scrollTop);

    console.log('will tap at', 25, top + hourHeight / 2)
    dayElt.tap(25, top - this.scrollTop + hourHeight / 2);
    console.log('plop');
  },

  waitForHourScrollEnd: function(hour) {
    // if displaying current day it scrolls to current time, if not it scrolls
    // to 8AM; it should also scroll to the created event, that's why we allow
    // overriding the `hour`.
    if (hour == null) {
      hour = this.todayDates.length ?
        Math.max(new Date().getHours() - 1, 0) :
        8;
    }
    var expected = this.getDestinationScrollTop(hour);
    this._waitForScrollEnd(expected);
  },

  _waitForScrollEnd: function(expected) {
    this.client.waitFor(function() {
      return this.scrollTop === expected;
    }.bind(this));
    this.client.waitFor(function() {
      return this.main.cssProperty('overflowY') !== 'hidden';
    }.bind(this));
  },

  getDestinationScrollTop: function(hour) {
    hour = Math.max(hour, 0);
    var bottomScrollTop = this.main.scriptWith(function(el) {
      return el.scrollHeight - el.clientHeight;
    });
    var hourOffsetTop = this.hours[hour].scriptWith(function(el) {
      return el.offsetTop;
    });
    return Math.min(hourOffsetTop, bottomScrollTop);
  },

  scrollToTop: function() {
    var height = this.element.scriptWith(function(el) {
      return el.clientHeight;
    });

    this.actions
      .flick(this.element, 10, 10, 10, height - 10)
      .perform();

    this._waitForScrollEnd(0);
  }
};
