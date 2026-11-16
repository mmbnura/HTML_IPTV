/*
 * MMB Player - virtualised list.
 *
 * Thousands of channels would make a TV browser crawl if rendered as DOM,
 * so only the rows visible on screen (plus a small margin) are created.
 * Rows have a fixed height (in rem) and are absolutely positioned.
 */
function VList(container, opts) {
  'use strict';
  this.el = container;
  this.opts = opts;               // {rowRem, render(item, index) -> html, onClick(index, target), className}
  this.items = [];
  this.focus = 0;
  this.active = false;            // whether this list owns the remote focus
  this.rows = {};                 // index -> element
  this.spacer = document.createElement('div');
  this.spacer.className = 'vlist-spacer';
  this.el.appendChild(this.spacer);

  var self = this;
  var ticking = false;
  this.el.addEventListener('scroll', function () {
    if (ticking) { return; }
    ticking = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      ticking = false;
      self.render();
    }, 16);
  });
  this.initPager();
  this.el.addEventListener('click', function (e) {
    var row = U.closest(e.target, 'data-index', self.el);
    if (!row) { return; }
    var idx = parseInt(row.getAttribute('data-index'), 10);
    self.opts.onClick(idx, e.target);
  });
}

/* ▲ / ▼ buttons next to the list (data-pager="<list id>"): click = one page,
   resting the pointer on them keeps scrolling. */
VList.prototype.initPager = function () {
  var self = this;
  this.pagers = [];
  var btns = document.querySelectorAll('[data-pager="' + this.el.id + '"]');
  for (var i = 0; i < btns.length; i++) {
    (function (btn) {
      var dir = parseInt(btn.getAttribute('data-dir'), 10);
      var hold = null;
      function stop() { clearTimeout(hold); hold = null; }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.page(dir);
      });
      btn.addEventListener('mouseenter', function () {
        stop();
        hold = setTimeout(function repeat() {
          if (!self.page(dir)) { return; }
          hold = setTimeout(repeat, 700);
        }, 900);
      });
      btn.addEventListener('mouseleave', stop);
      self.pagers.push({ btn: btn, dir: dir });
    })(btns[i]);
  }
};

VList.prototype.updatePager = function () {
  var top = this.el.scrollTop;
  var max = this.el.scrollHeight - this.el.clientHeight;
  for (var i = 0; i < this.pagers.length; i++) {
    var p = this.pagers[i];
    var off = p.dir < 0 ? top <= 0 : top >= max - 2;
    p.btn.className = p.btn.className.replace(/\s?disabled/g, '') + (off ? ' disabled' : '');
  }
};

/* scroll one page and keep the highlighted row on screen; false at the end */
VList.prototype.page = function (dir) {
  if (!this.items.length) { return false; }
  var rh = this.rowHeight();
  var h = this.el.clientHeight;
  var before = this.el.scrollTop;
  this.el.scrollTop = before + dir * Math.max(rh, Math.floor(h / rh) * rh - rh);
  if (this.el.scrollTop === before) { return false; }
  var first = Math.ceil(this.el.scrollTop / rh);
  var last = Math.floor((this.el.scrollTop + h) / rh) - 1;
  if (this.focus < first) { this.focus = first; }
  if (this.focus > last) { this.focus = Math.max(first, last); }
  this.render();
  return true;
};

VList.prototype.rowHeight = function () {
  var root = parseFloat(document.documentElement.style.fontSize) || 20;
  return Math.round(this.opts.rowRem * root);
};

VList.prototype.setItems = function (items, focus) {
  this.items = items || [];
  this.focus = Math.max(0, Math.min(focus || 0, this.items.length - 1));
  this.clear();
  this.spacer.style.height = (this.items.length * this.rowHeight()) + 'px';
  this.el.scrollTop = 0;
  this.ensureVisible(true);
  this.render();
  this.paintEmpty();
};

VList.prototype.paintEmpty = function () {
  if (!this.items.length && this.opts.empty) {
    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'empty';
    this.emptyEl.innerHTML = this.opts.empty();
    this.el.appendChild(this.emptyEl);
  }
};

VList.prototype.clear = function () {
  for (var k in this.rows) {
    if (this.rows.hasOwnProperty(k)) { this.el.removeChild(this.rows[k]); }
  }
  this.rows = {};
  if (this.emptyEl) {
    this.el.removeChild(this.emptyEl);
    this.emptyEl = null;
  }
};

VList.prototype.refresh = function () {
  // re-render everything (e.g. favorite star changed, or screen resized)
  this.clear();
  this.spacer.style.height = (this.items.length * this.rowHeight()) + 'px';
  this.render();
  this.paintEmpty();
};

VList.prototype.render = function () {
  var rh = this.rowHeight();
  var top = this.el.scrollTop;
  var h = this.el.clientHeight || 600;
  var first = Math.max(0, Math.floor(top / rh) - 4);
  var last = Math.min(this.items.length - 1, Math.ceil((top + h) / rh) + 4);
  var k, idx;

  for (k in this.rows) {
    if (this.rows.hasOwnProperty(k)) {
      idx = +k;
      if (idx < first || idx > last) {
        this.el.removeChild(this.rows[k]);
        delete this.rows[k];
      }
    }
  }
  for (idx = first; idx <= last; idx++) {
    if (this.rows[idx]) { continue; }
    var row = document.createElement('div');
    row.className = 'row ' + (this.opts.className || '');
    row.setAttribute('data-index', idx);
    row.style.top = (idx * rh) + 'px';
    row.style.height = rh + 'px';
    row.innerHTML = this.opts.render(this.items[idx], idx);
    if (this.opts.decorate) { this.opts.decorate(row, this.items[idx], idx); }
    this.el.appendChild(row);
    this.rows[idx] = row;
  }
  this.paintFocus();
  this.updatePager();
};

VList.prototype.paintFocus = function () {
  for (var k in this.rows) {
    if (this.rows.hasOwnProperty(k)) {
      var isF = (+k === this.focus);
      this.rows[k].className = this.rows[k].className
        .replace(/\s?(focused|selected-row)/g, '') +
        (isF ? (this.active ? ' focused' : ' selected-row') : '');
    }
  }
};

VList.prototype.setActive = function (on) {
  this.active = on;
  this.paintFocus();
};

VList.prototype.ensureVisible = function (center) {
  var rh = this.rowHeight();
  var h = this.el.clientHeight || 600;
  var y = this.focus * rh;
  if (center) {
    this.el.scrollTop = Math.max(0, y - Math.floor(h / 2) + rh);
  } else if (y < this.el.scrollTop) {
    this.el.scrollTop = y;
  } else if (y + rh > this.el.scrollTop + h) {
    this.el.scrollTop = y + rh - h;
  }
};

VList.prototype.move = function (delta) {
  if (!this.items.length) { return false; }
  var next = this.focus + delta;
  if (next < 0) { next = 0; }
  if (next > this.items.length - 1) { next = this.items.length - 1; }
  var changed = next !== this.focus;
  this.focus = next;
  this.ensureVisible(false);
  this.render();
  return changed;
};

VList.prototype.setFocus = function (idx, center) {
  if (!this.items.length) { return; }
  this.focus = Math.max(0, Math.min(idx, this.items.length - 1));
  this.ensureVisible(!!center);
  this.render();
};

VList.prototype.pageSize = function () {
  return Math.max(1, Math.floor((this.el.clientHeight || 600) / this.rowHeight()) - 1);
};

VList.prototype.current = function () {
  return this.items[this.focus];
};
