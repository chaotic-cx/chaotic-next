((e, t) => {
  'object' == typeof exports && 'undefined' != typeof module
    ? t(exports)
    : 'function' == typeof define && define.amd
      ? define(['exports'], t)
      : t((e.dat = {}));
})(this, (e) => {
  function t(e, t) {
    var i = e.__state.conversionName.toString(),
      o = Math.round(e.r),
      n = Math.round(e.g),
      r = Math.round(e.b),
      s = e.a,
      a = Math.round(e.h),
      l = e.s.toFixed(1),
      d = e.v.toFixed(1);
    if (t || 'THREE_CHAR_HEX' === i || 'SIX_CHAR_HEX' === i) {
      for (var c = e.hex.toString(16); c.length < 6; ) c = '0' + c;
      return '#' + c;
    }
    return 'CSS_RGB' === i
      ? 'rgb(' + o + ',' + n + ',' + r + ')'
      : 'CSS_RGBA' === i
        ? 'rgba(' + o + ',' + n + ',' + r + ',' + s + ')'
        : 'HEX' === i
          ? '0x' + e.hex.toString(16)
          : 'RGB_ARRAY' === i
            ? '[' + o + ',' + n + ',' + r + ']'
            : 'RGBA_ARRAY' === i
              ? '[' + o + ',' + n + ',' + r + ',' + s + ']'
              : 'RGB_OBJ' === i
                ? '{r:' + o + ',g:' + n + ',b:' + r + '}'
                : 'RGBA_OBJ' === i
                  ? '{r:' + o + ',g:' + n + ',b:' + r + ',a:' + s + '}'
                  : 'HSV_OBJ' === i
                    ? '{h:' + a + ',s:' + l + ',v:' + d + '}'
                    : 'HSVA_OBJ' === i
                      ? '{h:' + a + ',s:' + l + ',v:' + d + ',a:' + s + '}'
                      : 'unknown format';
  }
  function i(e, t, i) {
    Object.defineProperty(e, t, {
      get: function () {
        return 'RGB' === this.__state.space || I.recalculateRGB(this, t, i), this.__state[t];
      },
      set: function (e) {
        'RGB' !== this.__state.space && (I.recalculateRGB(this, t, i), (this.__state.space = 'RGB')),
          (this.__state[t] = e);
      },
    });
  }
  function o(e, t) {
    Object.defineProperty(e, t, {
      get: function () {
        return 'HSV' === this.__state.space || I.recalculateHSV(this), this.__state[t];
      },
      set: function (e) {
        'HSV' !== this.__state.space && (I.recalculateHSV(this), (this.__state.space = 'HSV')), (this.__state[t] = e);
      },
    });
  }
  function n(e) {
    if ('0' === e || k.isUndefined(e)) return 0;
    var t = e.match(M);
    return k.isNull(t) ? 0 : Number.parseFloat(t[1]);
  }
  function r(e) {
    var t = e.toString();
    return t.indexOf('.') > -1 ? t.length - t.indexOf('.') - 1 : 0;
  }
  function s(e, t) {
    var i = Math.pow(10, t);
    return Math.round(e * i) / i;
  }
  function a(e, t, i, o, n) {
    return o + ((e - t) / (i - t)) * (n - o);
  }
  function l(e, t, i, o) {
    (e.style.background = ''),
      k.each(ee, (n) => {
        e.style.cssText += 'background: ' + n + 'linear-gradient(' + t + ', ' + i + ' 0%, ' + o + ' 100%); ';
      });
  }
  function d(e) {
    (e.style.background = ''),
      (e.style.cssText +=
        'background: -moz-linear-gradient(top,  #ff0000 0%, #ff00ff 17%, #0000ff 34%, #00ffff 50%, #00ff00 67%, #ffff00 84%, #ff0000 100%);'),
      (e.style.cssText +=
        'background: -webkit-linear-gradient(top,  #ff0000 0%,#ff00ff 17%,#0000ff 34%,#00ffff 50%,#00ff00 67%,#ffff00 84%,#ff0000 100%);'),
      (e.style.cssText +=
        'background: -o-linear-gradient(top,  #ff0000 0%,#ff00ff 17%,#0000ff 34%,#00ffff 50%,#00ff00 67%,#ffff00 84%,#ff0000 100%);'),
      (e.style.cssText +=
        'background: -ms-linear-gradient(top,  #ff0000 0%,#ff00ff 17%,#0000ff 34%,#00ffff 50%,#00ff00 67%,#ffff00 84%,#ff0000 100%);'),
      (e.style.cssText +=
        'background: linear-gradient(top,  #ff0000 0%,#ff00ff 17%,#0000ff 34%,#00ffff 50%,#00ff00 67%,#ffff00 84%,#ff0000 100%);');
  }
  function c(e, t, i) {
    var o = document.createElement('li');
    return t && o.appendChild(t), i ? e.__ul.insertBefore(o, i) : e.__ul.appendChild(o), e.onResize(), o;
  }
  function u(e) {
    j.unbind(window, 'resize', e.__resizeHandler),
      e.saveToLocalStorageIfPossible && j.unbind(window, 'unload', e.saveToLocalStorageIfPossible);
  }
  function h(e, t) {
    var i = e.__preset_select[e.__preset_select.selectedIndex];
    i.innerHTML = t ? i.value + '*' : i.value;
  }
  function p(e, t, i) {
    if (
      ((i.__li = t),
      (i.__gui = e),
      k.extend(i, {
        options(t) {
          if (arguments.length > 1) {
            var o = i.__li.nextElementSibling;
            return i.remove(), m(e, i.object, i.property, { before: o, factoryArgs: [k.toArray(arguments)] });
          }
          if (k.isArray(t) || k.isObject(t)) {
            var n = i.__li.nextElementSibling;
            return i.remove(), m(e, i.object, i.property, { before: n, factoryArgs: [t] });
          }
        },
        name: (e) => ((i.__li.firstElementChild.firstElementChild.innerHTML = e), i),
        listen: () => (i.__gui.listen(i), i),
        remove: () => (i.__gui.remove(i), i),
      }),
      i instanceof Q)
    ) {
      var o = new J(i.object, i.property, { min: i.__min, max: i.__max, step: i.__step });
      k.each(['updateDisplay', 'onChange', 'onFinishChange', 'step'], (e) => {
        var t = i[e],
          n = o[e];
        i[e] = o[e] = () => {
          var e = Array.prototype.slice.call(arguments);
          return n.apply(o, e), t.apply(i, e);
        };
      }),
        j.addClass(t, 'has-slider'),
        i.domElement.insertBefore(o.domElement, i.domElement.firstElementChild);
    } else if (i instanceof J) {
      var n = (t) => {
        if (k.isNumber(i.__min) && k.isNumber(i.__max)) {
          var o = i.__li.firstElementChild.firstElementChild.innerHTML,
            n = i.__gui.__listening.indexOf(i) > -1;
          i.remove();
          var r = m(e, i.object, i.property, {
            before: i.__li.nextElementSibling,
            factoryArgs: [i.__min, i.__max, i.__step],
          });
          return r.name(o), n && r.listen(), r;
        }
        return t;
      };
      (i.min = k.compose(n, i.min)), (i.max = k.compose(n, i.max));
    } else
      i instanceof X
        ? (j.bind(t, 'click', () => {
            j.fakeEvent(i.__checkbox, 'click');
          }),
          j.bind(i.__checkbox, 'click', (e) => {
            e.stopPropagation();
          }))
        : i instanceof q
          ? (j.bind(t, 'click', () => {
              j.fakeEvent(i.__button, 'click');
            }),
            j.bind(t, 'mouseover', () => {
              j.addClass(i.__button, 'hover');
            }),
            j.bind(t, 'mouseout', () => {
              j.removeClass(i.__button, 'hover');
            }))
          : i instanceof Z &&
            (j.addClass(t, 'color'),
            (i.updateDisplay = k.compose(
              (e) => ((t.style.borderLeftColor = i.__color.toString()), e),
              i.updateDisplay,
            )),
            i.updateDisplay());
    i.setValue = k.compose((t) => (e.getRoot().__preset_select && i.isModified() && h(e.getRoot(), !0), t), i.setValue);
  }
  function f(e, t) {
    var i = e.getRoot(),
      o = i.__rememberedObjects.indexOf(t.object);
    if (-1 !== o) {
      var n = i.__rememberedObjectIndecesToControllers[o];
      if (
        (void 0 === n && ((n = {}), (i.__rememberedObjectIndecesToControllers[o] = n)),
        (n[t.property] = t),
        i.load && i.load.remembered)
      ) {
        var r = i.load.remembered,
          s = void 0;
        if (r[e.preset]) s = r[e.preset];
        else {
          if (!r[es]) return;
          s = r[es];
        }
        if (s[o] && void 0 !== s[o][t.property]) {
          var a = s[o][t.property];
          (t.initialValue = a), t.setValue(a);
        }
      }
    }
  }
  function m(e, t, i, o) {
    if (void 0 === t[i]) throw Error('Object "' + t + '" has no property "' + i + '"');
    var n = void 0;
    if (o.color) n = new Z(t, i);
    else {
      var r = [t, i].concat(o.factoryArgs);
      n = ei.apply(e, r);
    }
    o.before instanceof z && (o.before = o.before.__li), f(e, n), j.addClass(n.domElement, 'c');
    var s = document.createElement('span');
    j.addClass(s, 'property-name'), (s.innerHTML = n.property);
    var a = document.createElement('div');
    a.appendChild(s), a.appendChild(n.domElement);
    var l = c(e, a, o.before);
    return (
      j.addClass(l, eh.CLASS_CONTROLLER_ROW),
      n instanceof Z ? j.addClass(l, 'color') : j.addClass(l, N(n.getValue())),
      p(e, l, n),
      e.__controllers.push(n),
      n
    );
  }
  function g(e, t) {
    return document.location.href + '.' + t;
  }
  function b(e, t, i) {
    var o = document.createElement('option');
    (o.innerHTML = t),
      (o.value = t),
      e.__preset_select.appendChild(o),
      i && (e.__preset_select.selectedIndex = e.__preset_select.length - 1);
  }
  function v(e, t) {
    t.style.display = e.useLocalStorage ? 'block' : 'none';
  }
  function $(e) {
    var t = (e.__save_row = document.createElement('li'));
    j.addClass(e.domElement, 'has-save'), e.__ul.insertBefore(t, e.__ul.firstChild), j.addClass(t, 'save-row');
    var i = document.createElement('span');
    (i.innerHTML = '&nbsp;'), j.addClass(i, 'button gears');
    var o = document.createElement('span');
    (o.innerHTML = 'Save'), j.addClass(o, 'button'), j.addClass(o, 'save');
    var n = document.createElement('span');
    (n.innerHTML = 'New'), j.addClass(n, 'button'), j.addClass(n, 'save-as');
    var r = document.createElement('span');
    (r.innerHTML = 'Revert'), j.addClass(r, 'button'), j.addClass(r, 'revert');
    var s = (e.__preset_select = document.createElement('select'));
    if (
      (e.load && e.load.remembered
        ? k.each(e.load.remembered, (t, i) => {
            b(e, i, i === e.preset);
          })
        : b(e, es, !1),
      j.bind(s, 'change', function () {
        for (var t = 0; t < e.__preset_select.length; t++) e.__preset_select[t].innerHTML = e.__preset_select[t].value;
        e.preset = this.value;
      }),
      t.appendChild(s),
      t.appendChild(i),
      t.appendChild(o),
      t.appendChild(n),
      t.appendChild(r),
      ea)
    ) {
      var a = document.getElementById('dg-local-explain'),
        l = document.getElementById('dg-local-storage');
      (document.getElementById('dg-save-locally').style.display = 'block'),
        'true' === localStorage.getItem(g(e, 'isLocal')) && l.setAttribute('checked', 'checked'),
        v(e, a),
        j.bind(l, 'change', () => {
          (e.useLocalStorage = !e.useLocalStorage), v(e, a);
        });
    }
    var d = document.getElementById('dg-new-constructor');
    j.bind(d, 'keydown', (e) => {
      e.metaKey && (67 === e.which || 67 === e.keyCode) && el.hide();
    }),
      j.bind(i, 'click', () => {
        (d.innerHTML = JSON.stringify(e.getSaveObject(), void 0, 2)), el.show(), d.focus(), d.select();
      }),
      j.bind(o, 'click', () => {
        e.save();
      }),
      j.bind(n, 'click', () => {
        var t = prompt('Enter a new preset name.');
        t && e.saveAs(t);
      }),
      j.bind(r, 'click', () => {
        e.revert();
      });
  }
  function y(e) {
    function t(t) {
      return t.preventDefault(), (e.width += n - t.clientX), e.onResize(), (n = t.clientX), !1;
    }
    function i() {
      j.removeClass(e.__closeButton, eh.CLASS_DRAG), j.unbind(window, 'mousemove', t), j.unbind(window, 'mouseup', i);
    }
    function o(o) {
      return (
        o.preventDefault(),
        (n = o.clientX),
        j.addClass(e.__closeButton, eh.CLASS_DRAG),
        j.bind(window, 'mousemove', t),
        j.bind(window, 'mouseup', i),
        !1
      );
    }
    var n = void 0;
    (e.__resize_handle = document.createElement('div')),
      k.extend(e.__resize_handle.style, {
        width: '6px',
        marginLeft: '-3px',
        height: '200px',
        cursor: 'ew-resize',
        position: 'absolute',
      }),
      j.bind(e.__resize_handle, 'mousedown', o),
      j.bind(e.__closeButton, 'mousedown', o),
      e.domElement.insertBefore(e.__resize_handle, e.domElement.firstElementChild);
  }
  function x(e, t) {
    (e.domElement.style.width = t + 'px'),
      e.__save_row && e.autoPlace && (e.__save_row.style.width = t + 'px'),
      e.__closeButton && (e.__closeButton.style.width = t + 'px');
  }
  function _(e, t) {
    var i = {};
    return (
      k.each(e.__rememberedObjects, (o, n) => {
        var r = {},
          s = e.__rememberedObjectIndecesToControllers[n];
        k.each(s, (e, i) => {
          r[i] = t ? e.initialValue : e.getValue();
        }),
          (i[n] = r);
      }),
      i
    );
  }
  function E(e) {
    for (var t = 0; t < e.__preset_select.length; t++)
      e.__preset_select[t].value === e.preset && (e.__preset_select.selectedIndex = t);
  }
  function C(e) {
    0 !== e.length &&
      eo.call(window, () => {
        C(e);
      }),
      k.each(e, (e) => {
        e.updateDisplay();
      });
  }
  var A = Array.prototype.forEach,
    w = Array.prototype.slice,
    k = {
      BREAK: {},
      extend: function (e) {
        return (
          this.each(
            w.call(arguments, 1),
            function (t) {
              (this.isObject(t) ? Object.keys(t) : []).forEach(
                function (i) {
                  this.isUndefined(t[i]) || (e[i] = t[i]);
                }.bind(this),
              );
            },
            this,
          ),
          e
        );
      },
      defaults: function (e) {
        return (
          this.each(
            w.call(arguments, 1),
            function (t) {
              (this.isObject(t) ? Object.keys(t) : []).forEach(
                function (i) {
                  this.isUndefined(e[i]) && (e[i] = t[i]);
                }.bind(this),
              );
            },
            this,
          ),
          e
        );
      },
      compose() {
        var e = w.call(arguments);
        return function () {
          for (var t = w.call(arguments), i = e.length - 1; i >= 0; i--) t = [e[i].apply(this, t)];
          return t[0];
        };
      },
      each: function (e, t, i) {
        if (e) {
          if (A && e.forEach && e.forEach === A) e.forEach(t, i);
          else if (e.length === e.length + 0) {
            var o = void 0,
              n = void 0;
            for (o = 0, n = e.length; o < n; o++) if (o in e && t.call(i, e[o], o) === this.BREAK) return;
          } else for (var r in e) if (t.call(i, e[r], r) === this.BREAK) return;
        }
      },
      defer(e) {
        setTimeout(e, 0);
      },
      debounce(e, t, i) {
        var o = void 0;
        return function () {
          var n = arguments,
            r = i || !o;
          clearTimeout(o),
            (o = setTimeout(() => {
              (o = null), i || e.apply(this, n);
            }, t)),
            r && e.apply(this, n);
        };
      },
      toArray: (e) => (e.toArray ? e.toArray() : w.call(e)),
      isUndefined: (e) => void 0 === e,
      isNull: (e) => null === e,
      isNaN: ((e) => {
        function t(t) {
          return e.apply(this, arguments);
        }
        return (t.toString = () => e.toString()), t;
      })((e) => isNaN(e)),
      isArray: Array.isArray || ((e) => e.constructor === Array),
      isObject: (e) => e === Object(e),
      isNumber: (e) => e === e + 0,
      isString: (e) => e === e + '',
      isBoolean: (e) => !1 === e || !0 === e,
      isFunction: (e) => '[object Function]' === Object.prototype.toString.call(e),
    },
    S = [
      {
        litmus: k.isString,
        conversions: {
          THREE_CHAR_HEX: {
            read(e) {
              var t = e.match(/^#([A-F0-9])([A-F0-9])([A-F0-9])$/i);
              return (
                null !== t && {
                  space: 'HEX',
                  hex: Number.parseInt(
                    '0x' +
                      t[1].toString() +
                      t[1].toString() +
                      t[2].toString() +
                      t[2].toString() +
                      t[3].toString() +
                      t[3].toString(),
                    0,
                  ),
                }
              );
            },
            write: t,
          },
          SIX_CHAR_HEX: {
            read(e) {
              var t = e.match(/^#([A-F0-9]{6})$/i);
              return null !== t && { space: 'HEX', hex: Number.parseInt('0x' + t[1].toString(), 0) };
            },
            write: t,
          },
          CSS_RGB: {
            read(e) {
              var t = e.match(/^rgb\(\s*(.+)\s*,\s*(.+)\s*,\s*(.+)\s*\)/);
              return (
                null !== t && {
                  space: 'RGB',
                  r: Number.parseFloat(t[1]),
                  g: Number.parseFloat(t[2]),
                  b: Number.parseFloat(t[3]),
                }
              );
            },
            write: t,
          },
          CSS_RGBA: {
            read(e) {
              var t = e.match(/^rgba\(\s*(.+)\s*,\s*(.+)\s*,\s*(.+)\s*,\s*(.+)\s*\)/);
              return (
                null !== t && {
                  space: 'RGB',
                  r: Number.parseFloat(t[1]),
                  g: Number.parseFloat(t[2]),
                  b: Number.parseFloat(t[3]),
                  a: Number.parseFloat(t[4]),
                }
              );
            },
            write: t,
          },
        },
      },
      {
        litmus: k.isNumber,
        conversions: {
          HEX: { read: (e) => ({ space: 'HEX', hex: e, conversionName: 'HEX' }), write: (e) => e.hex },
        },
      },
      {
        litmus: k.isArray,
        conversions: {
          RGB_ARRAY: {
            read: (e) => 3 === e.length && { space: 'RGB', r: e[0], g: e[1], b: e[2] },
            write: (e) => [e.r, e.g, e.b],
          },
          RGBA_ARRAY: {
            read: (e) => 4 === e.length && { space: 'RGB', r: e[0], g: e[1], b: e[2], a: e[3] },
            write: (e) => [e.r, e.g, e.b, e.a],
          },
        },
      },
      {
        litmus: k.isObject,
        conversions: {
          RGBA_OBJ: {
            read: (e) =>
              !!(k.isNumber(e.r) && k.isNumber(e.g) && k.isNumber(e.b) && k.isNumber(e.a)) && {
                space: 'RGB',
                r: e.r,
                g: e.g,
                b: e.b,
                a: e.a,
              },
            write: (e) => ({ r: e.r, g: e.g, b: e.b, a: e.a }),
          },
          RGB_OBJ: {
            read: (e) =>
              !!(k.isNumber(e.r) && k.isNumber(e.g) && k.isNumber(e.b)) && {
                space: 'RGB',
                r: e.r,
                g: e.g,
                b: e.b,
              },
            write: (e) => ({ r: e.r, g: e.g, b: e.b }),
          },
          HSVA_OBJ: {
            read: (e) =>
              !!(k.isNumber(e.h) && k.isNumber(e.s) && k.isNumber(e.v) && k.isNumber(e.a)) && {
                space: 'HSV',
                h: e.h,
                s: e.s,
                v: e.v,
                a: e.a,
              },
            write: (e) => ({ h: e.h, s: e.s, v: e.v, a: e.a }),
          },
          HSV_OBJ: {
            read: (e) =>
              !!(k.isNumber(e.h) && k.isNumber(e.s) && k.isNumber(e.v)) && {
                space: 'HSV',
                h: e.h,
                s: e.s,
                v: e.v,
              },
            write: (e) => ({ h: e.h, s: e.s, v: e.v }),
          },
        },
      },
    ],
    O = void 0,
    T = void 0,
    L = () => {
      T = !1;
      var e = arguments.length > 1 ? k.toArray(arguments) : arguments[0];
      return (
        k.each(S, (t) => {
          if (t.litmus(e))
            return (
              k.each(t.conversions, (t, i) => {
                if (((O = t.read(e)), !1 === T && !1 !== O))
                  return (T = O), (O.conversionName = i), (O.conversion = t), k.BREAK;
              }),
              k.BREAK
            );
        }),
        T
      );
    },
    R = void 0,
    B = {
      hsv_to_rgb(e, t, i) {
        var o = e / 60 - Math.floor(e / 60),
          n = i * (1 - t),
          r = i * (1 - o * t),
          s = i * (1 - (1 - o) * t),
          a = [
            [i, s, n],
            [r, i, n],
            [n, i, s],
            [n, r, i],
            [s, n, i],
            [i, n, r],
          ][Math.floor(e / 60) % 6];
        return { r: 255 * a[0], g: 255 * a[1], b: 255 * a[2] };
      },
      rgb_to_hsv(e, t, i) {
        var o = Math.max(e, t, i),
          n = o - Math.min(e, t, i),
          r = void 0,
          s = void 0;
        return 0 === o
          ? { h: Number.NaN, s: 0, v: 0 }
          : ((s = n / o),
            (r = e === o ? (t - i) / n : t === o ? 2 + (i - e) / n : 4 + (e - t) / n),
            (r /= 6) < 0 && (r += 1),
            { h: 360 * r, s: s, v: o / 255 });
      },
      rgb_to_hex: function (e, t, i) {
        var o = this.hex_with_component(0, 2, e);
        return (o = this.hex_with_component(o, 1, t)), (o = this.hex_with_component(o, 0, i));
      },
      component_from_hex: (e, t) => (e >> (8 * t)) & 255,
      hex_with_component: (e, t, i) => (i << (R = 8 * t)) | (e & ~(255 << R)),
    },
    N =
      'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
        ? (e) => typeof e
        : (e) =>
            e && 'function' == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype
              ? 'symbol'
              : typeof e,
    H = (e, t) => {
      if (!(e instanceof t)) throw TypeError('Cannot call a class as a function');
    },
    F = (() => {
      function e(e, t) {
        for (var i = 0; i < t.length; i++) {
          var o = t[i];
          (o.enumerable = o.enumerable || !1),
            (o.configurable = !0),
            'value' in o && (o.writable = !0),
            Object.defineProperty(e, o.key, o);
        }
      }
      return (t, i, o) => (i && e(t.prototype, i), o && e(t, o), t);
    })(),
    P = function e(t, i, o) {
      null === t && (t = Function.prototype);
      var n = Object.getOwnPropertyDescriptor(t, i);
      if (void 0 === n) {
        var r = Object.getPrototypeOf(t);
        return null === r ? void 0 : e(r, i, o);
      }
      if ('value' in n) return n.value;
      var s = n.get;
      if (void 0 !== s) return s.call(o);
    },
    D = (e, t) => {
      if ('function' != typeof t && null !== t)
        throw TypeError('Super expression must either be null or a function, not ' + typeof t);
      (e.prototype = Object.create(t && t.prototype, {
        constructor: { value: e, enumerable: !1, writable: !0, configurable: !0 },
      })),
        t && (Object.setPrototypeOf ? Object.setPrototypeOf(e, t) : (e.__proto__ = t));
    },
    V = (e, t) => {
      if (!e) throw ReferenceError("this hasn't been initialised - super() hasn't been called");
      return t && ('object' == typeof t || 'function' == typeof t) ? t : e;
    },
    I = (() => {
      function e() {
        if ((H(this, e), (this.__state = L.apply(this, arguments)), !1 === this.__state))
          throw Error('Failed to interpret color arguments');
        this.__state.a = this.__state.a || 1;
      }
      return (
        F(e, [
          {
            key: 'toString',
            value: function () {
              return t(this);
            },
          },
          {
            key: 'toHexString',
            value: function () {
              return t(this, !0);
            },
          },
          {
            key: 'toOriginal',
            value: function () {
              return this.__state.conversion.write(this);
            },
          },
        ]),
        e
      );
    })();
  (I.recalculateRGB = (e, t, i) => {
    if ('HEX' === e.__state.space) e.__state[t] = B.component_from_hex(e.__state.hex, i);
    else {
      if ('HSV' !== e.__state.space) throw Error('Corrupted color state');
      k.extend(e.__state, B.hsv_to_rgb(e.__state.h, e.__state.s, e.__state.v));
    }
  }),
    (I.recalculateHSV = (e) => {
      var t = B.rgb_to_hsv(e.r, e.g, e.b);
      k.extend(e.__state, { s: t.s, v: t.v }),
        k.isNaN(t.h) ? k.isUndefined(e.__state.h) && (e.__state.h = 0) : (e.__state.h = t.h);
    }),
    (I.COMPONENTS = ['r', 'g', 'b', 'h', 's', 'v', 'hex', 'a']),
    i(I.prototype, 'r', 2),
    i(I.prototype, 'g', 1),
    i(I.prototype, 'b', 0),
    o(I.prototype, 'h'),
    o(I.prototype, 's'),
    o(I.prototype, 'v'),
    Object.defineProperty(I.prototype, 'a', {
      get: function () {
        return this.__state.a;
      },
      set: function (e) {
        this.__state.a = e;
      },
    }),
    Object.defineProperty(I.prototype, 'hex', {
      get: function () {
        return this.__state.space, (this.__state.hex = B.rgb_to_hex(this.r, this.g, this.b)), this.__state.hex;
      },
      set: function (e) {
        (this.__state.space = 'HEX'), (this.__state.hex = e);
      },
    });
  var z = (() => {
      function e(t, i) {
        H(this, e),
          (this.initialValue = t[i]),
          (this.domElement = document.createElement('div')),
          (this.object = t),
          (this.property = i),
          (this.__onChange = void 0),
          (this.__onFinishChange = void 0);
      }
      return (
        F(e, [
          {
            key: 'onChange',
            value: function (e) {
              return (this.__onChange = e), this;
            },
          },
          {
            key: 'onFinishChange',
            value: function (e) {
              return (this.__onFinishChange = e), this;
            },
          },
          {
            key: 'setValue',
            value: function (e) {
              return (
                (this.object[this.property] = e),
                this.__onChange && this.__onChange.call(this, e),
                this.updateDisplay(),
                this
              );
            },
          },
          {
            key: 'getValue',
            value: function () {
              return this.object[this.property];
            },
          },
          {
            key: 'updateDisplay',
            value: function () {
              return this;
            },
          },
          {
            key: 'isModified',
            value: function () {
              return this.initialValue !== this.getValue();
            },
          },
        ]),
        e
      );
    })(),
    G = {
      HTMLEvents: ['change'],
      MouseEvents: ['click', 'mousemove', 'mousedown', 'mouseup', 'mouseover'],
      KeyboardEvents: ['keydown'],
    },
    U = {};
  k.each(G, (e, t) => {
    k.each(e, (e) => {
      U[e] = t;
    });
  });
  var M = /(\d+(\.\d+)?)px/,
    j = {
      makeSelectable(e, t) {
        void 0 !== e &&
          void 0 !== e.style &&
          ((e.onselectstart = t ? () => !1 : () => {}),
          (e.style.MozUserSelect = t ? 'auto' : 'none'),
          (e.style.KhtmlUserSelect = t ? 'auto' : 'none'),
          (e.unselectable = t ? 'on' : 'off'));
      },
      makeFullscreen(e, t, i) {
        var o = i,
          n = t;
        k.isUndefined(n) && (n = !0),
          k.isUndefined(o) && (o = !0),
          (e.style.position = 'absolute'),
          n && ((e.style.left = 0), (e.style.right = 0)),
          o && ((e.style.top = 0), (e.style.bottom = 0));
      },
      fakeEvent(e, t, i, o) {
        var n = i || {},
          r = U[t];
        if (!r) throw Error('Event type ' + t + ' not supported.');
        var s = document.createEvent(r);
        switch (r) {
          case 'MouseEvents':
            var a = n.x || n.clientX || 0,
              l = n.y || n.clientY || 0;
            s.initMouseEvent(
              t,
              n.bubbles || !1,
              n.cancelable || !0,
              window,
              n.clickCount || 1,
              0,
              0,
              a,
              l,
              !1,
              !1,
              !1,
              !1,
              0,
              null,
            );
            break;
          case 'KeyboardEvents':
            var d = s.initKeyboardEvent || s.initKeyEvent;
            k.defaults(n, {
              cancelable: !0,
              ctrlKey: !1,
              altKey: !1,
              shiftKey: !1,
              metaKey: !1,
              keyCode: void 0,
              charCode: void 0,
            }),
              d(
                t,
                n.bubbles || !1,
                n.cancelable,
                window,
                n.ctrlKey,
                n.altKey,
                n.shiftKey,
                n.metaKey,
                n.keyCode,
                n.charCode,
              );
            break;
          default:
            s.initEvent(t, n.bubbles || !1, n.cancelable || !0);
        }
        k.defaults(s, o), e.dispatchEvent(s);
      },
      bind: (e, t, i, o) => (
        e.addEventListener ? e.addEventListener(t, i, o || !1) : e.attachEvent && e.attachEvent('on' + t, i), j
      ),
      unbind: (e, t, i, o) => (
        e.removeEventListener ? e.removeEventListener(t, i, o || !1) : e.detachEvent && e.detachEvent('on' + t, i), j
      ),
      addClass(e, t) {
        if (void 0 === e.className) e.className = t;
        else if (e.className !== t) {
          var i = e.className.split(/ +/);
          -1 === i.indexOf(t) && (i.push(t), (e.className = i.join(' ').replace(/^\s+/, '').replace(/\s+$/, '')));
        }
        return j;
      },
      removeClass(e, t) {
        if (t) {
          if (e.className === t) e.removeAttribute('class');
          else {
            var i = e.className.split(/ +/),
              o = i.indexOf(t);
            -1 !== o && (i.splice(o, 1), (e.className = i.join(' ')));
          }
        } else e.className = void 0;
        return j;
      },
      hasClass: (e, t) => RegExp('(?:^|\\s+)' + t + '(?:\\s+|$)').test(e.className) || !1,
      getWidth(e) {
        var t = getComputedStyle(e);
        return (
          n(t['border-left-width']) +
          n(t['border-right-width']) +
          n(t['padding-left']) +
          n(t['padding-right']) +
          n(t.width)
        );
      },
      getHeight(e) {
        var t = getComputedStyle(e);
        return (
          n(t['border-top-width']) +
          n(t['border-bottom-width']) +
          n(t['padding-top']) +
          n(t['padding-bottom']) +
          n(t.height)
        );
      },
      getOffset(e) {
        var t = e,
          i = { left: 0, top: 0 };
        if (t.offsetParent)
          do (i.left += t.offsetLeft), (i.top += t.offsetTop), (t = t.offsetParent);
          while (t);
        return i;
      },
      isActive: (e) => e === document.activeElement && (e.type || e.href),
    },
    X = ((e) => {
      function t(e, i) {
        H(this, t);
        var o = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i)),
          n = o;
        return (
          (o.__prev = o.getValue()),
          (o.__checkbox = document.createElement('input')),
          o.__checkbox.setAttribute('type', 'checkbox'),
          j.bind(
            o.__checkbox,
            'change',
            () => {
              n.setValue(!n.__prev);
            },
            !1,
          ),
          o.domElement.appendChild(o.__checkbox),
          o.updateDisplay(),
          o
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'setValue',
            value: function (e) {
              var i = P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'setValue', this).call(this, e);
              return (
                this.__onFinishChange && this.__onFinishChange.call(this, this.getValue()),
                (this.__prev = this.getValue()),
                i
              );
            },
          },
          {
            key: 'updateDisplay',
            value: function () {
              return (
                !0 === this.getValue()
                  ? (this.__checkbox.setAttribute('checked', 'checked'),
                    (this.__checkbox.checked = !0),
                    (this.__prev = !0))
                  : ((this.__checkbox.checked = !1), (this.__prev = !1)),
                P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'updateDisplay', this).call(this)
              );
            },
          },
        ]),
        t
      );
    })(),
    K = ((e) => {
      function t(e, i, o) {
        H(this, t);
        var n = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i)),
          r = o,
          s = n;
        if (((n.__select = document.createElement('select')), k.isArray(r))) {
          var a = {};
          k.each(r, (e) => {
            a[e] = e;
          }),
            (r = a);
        }
        return (
          k.each(r, (e, t) => {
            var i = document.createElement('option');
            (i.innerHTML = t), i.setAttribute('value', e), s.__select.appendChild(i);
          }),
          n.updateDisplay(),
          j.bind(n.__select, 'change', function () {
            var e = this.options[this.selectedIndex].value;
            s.setValue(e);
          }),
          n.domElement.appendChild(n.__select),
          n
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'setValue',
            value: function (e) {
              var i = P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'setValue', this).call(this, e);
              return this.__onFinishChange && this.__onFinishChange.call(this, this.getValue()), i;
            },
          },
          {
            key: 'updateDisplay',
            value: function () {
              return j.isActive(this.__select)
                ? this
                : ((this.__select.value = this.getValue()),
                  P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'updateDisplay', this).call(this));
            },
          },
        ]),
        t
      );
    })(),
    Y = ((e) => {
      function t(e, i) {
        function o() {
          r.setValue(r.__input.value);
        }
        H(this, t);
        var n = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i)),
          r = n;
        return (
          (n.__input = document.createElement('input')),
          n.__input.setAttribute('type', 'text'),
          j.bind(n.__input, 'keyup', o),
          j.bind(n.__input, 'change', o),
          j.bind(n.__input, 'blur', () => {
            r.__onFinishChange && r.__onFinishChange.call(r, r.getValue());
          }),
          j.bind(n.__input, 'keydown', function (e) {
            13 === e.keyCode && this.blur();
          }),
          n.updateDisplay(),
          n.domElement.appendChild(n.__input),
          n
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'updateDisplay',
            value: function () {
              return (
                j.isActive(this.__input) || (this.__input.value = this.getValue()),
                P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'updateDisplay', this).call(this)
              );
            },
          },
        ]),
        t
      );
    })(),
    W = ((e) => {
      function t(e, i, o) {
        H(this, t);
        var n = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i)),
          s = o || {};
        return (
          (n.__min = s.min),
          (n.__max = s.max),
          (n.__step = s.step),
          k.isUndefined(n.__step)
            ? 0 === n.initialValue
              ? (n.__impliedStep = 1)
              : (n.__impliedStep = Math.pow(10, Math.floor(Math.log(Math.abs(n.initialValue)) / Math.LN10)) / 10)
            : (n.__impliedStep = n.__step),
          (n.__precision = r(n.__impliedStep)),
          n
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'setValue',
            value: function (e) {
              var i = e;
              return (
                void 0 !== this.__min && i < this.__min
                  ? (i = this.__min)
                  : void 0 !== this.__max && i > this.__max && (i = this.__max),
                void 0 !== this.__step && i % this.__step != 0 && (i = Math.round(i / this.__step) * this.__step),
                P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'setValue', this).call(this, i)
              );
            },
          },
          {
            key: 'min',
            value: function (e) {
              return (this.__min = e), this;
            },
          },
          {
            key: 'max',
            value: function (e) {
              return (this.__max = e), this;
            },
          },
          {
            key: 'step',
            value: function (e) {
              return (this.__step = e), (this.__impliedStep = e), (this.__precision = r(e)), this;
            },
          },
        ]),
        t
      );
    })(),
    J = ((e) => {
      function t(e, i, o) {
        function n() {
          l.__onFinishChange && l.__onFinishChange.call(l, l.getValue());
        }
        function r(e) {
          var t = d - e.clientY;
          l.setValue(l.getValue() + t * l.__impliedStep), (d = e.clientY);
        }
        function s() {
          j.unbind(window, 'mousemove', r), j.unbind(window, 'mouseup', s), n();
        }
        H(this, t);
        var a = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i, o));
        a.__truncationSuspended = !1;
        var l = a,
          d = void 0;
        return (
          (a.__input = document.createElement('input')),
          a.__input.setAttribute('type', 'text'),
          j.bind(a.__input, 'change', () => {
            var e = Number.parseFloat(l.__input.value);
            k.isNaN(e) || l.setValue(e);
          }),
          j.bind(a.__input, 'blur', () => {
            n();
          }),
          j.bind(a.__input, 'mousedown', (e) => {
            j.bind(window, 'mousemove', r), j.bind(window, 'mouseup', s), (d = e.clientY);
          }),
          j.bind(a.__input, 'keydown', function (e) {
            13 === e.keyCode && ((l.__truncationSuspended = !0), this.blur(), (l.__truncationSuspended = !1), n());
          }),
          a.updateDisplay(),
          a.domElement.appendChild(a.__input),
          a
        );
      }
      return (
        D(t, W),
        F(t, [
          {
            key: 'updateDisplay',
            value: function () {
              return (
                (this.__input.value = this.__truncationSuspended
                  ? this.getValue()
                  : s(this.getValue(), this.__precision)),
                P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'updateDisplay', this).call(this)
              );
            },
          },
        ]),
        t
      );
    })(),
    Q = ((e) => {
      function t(e, i, o, n, r) {
        function s(e) {
          e.preventDefault();
          var t = h.__background.getBoundingClientRect();
          return h.setValue(a(e.clientX, t.left, t.right, h.__min, h.__max)), !1;
        }
        function l() {
          j.unbind(window, 'mousemove', s),
            j.unbind(window, 'mouseup', l),
            h.__onFinishChange && h.__onFinishChange.call(h, h.getValue());
        }
        function d(e) {
          var t = e.touches[0].clientX,
            i = h.__background.getBoundingClientRect();
          h.setValue(a(t, i.left, i.right, h.__min, h.__max));
        }
        function c() {
          j.unbind(window, 'touchmove', d),
            j.unbind(window, 'touchend', c),
            h.__onFinishChange && h.__onFinishChange.call(h, h.getValue());
        }
        H(this, t);
        var u = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i, { min: o, max: n, step: r })),
          h = u;
        return (
          (u.__background = document.createElement('div')),
          (u.__foreground = document.createElement('div')),
          j.bind(u.__background, 'mousedown', (e) => {
            document.activeElement.blur(), j.bind(window, 'mousemove', s), j.bind(window, 'mouseup', l), s(e);
          }),
          j.bind(u.__background, 'touchstart', (e) => {
            1 === e.touches.length && (j.bind(window, 'touchmove', d), j.bind(window, 'touchend', c), d(e));
          }),
          j.addClass(u.__background, 'slider'),
          j.addClass(u.__foreground, 'slider-fg'),
          u.updateDisplay(),
          u.__background.appendChild(u.__foreground),
          u.domElement.appendChild(u.__background),
          u
        );
      }
      return (
        D(t, W),
        F(t, [
          {
            key: 'updateDisplay',
            value: function () {
              var e = (this.getValue() - this.__min) / (this.__max - this.__min);
              return (
                (this.__foreground.style.width = 100 * e + '%'),
                P(t.prototype.__proto__ || Object.getPrototypeOf(t.prototype), 'updateDisplay', this).call(this)
              );
            },
          },
        ]),
        t
      );
    })(),
    q = ((e) => {
      function t(e, i, o) {
        H(this, t);
        var n = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i)),
          r = n;
        return (
          (n.__button = document.createElement('div')),
          (n.__button.innerHTML = void 0 === o ? 'Fire' : o),
          j.bind(n.__button, 'click', (e) => (e.preventDefault(), r.fire(), !1)),
          j.addClass(n.__button, 'button'),
          n.domElement.appendChild(n.__button),
          n
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'fire',
            value: function () {
              this.__onChange && this.__onChange.call(this),
                this.getValue().call(this.object),
                this.__onFinishChange && this.__onFinishChange.call(this, this.getValue());
            },
          },
        ]),
        t
      );
    })(),
    Z = ((e) => {
      function t(e, i) {
        function o(e) {
          u(e),
            j.bind(window, 'mousemove', u),
            j.bind(window, 'touchmove', u),
            j.bind(window, 'mouseup', r),
            j.bind(window, 'touchend', r);
        }
        function n(e) {
          h(e),
            j.bind(window, 'mousemove', h),
            j.bind(window, 'touchmove', h),
            j.bind(window, 'mouseup', s),
            j.bind(window, 'touchend', s);
        }
        function r() {
          j.unbind(window, 'mousemove', u),
            j.unbind(window, 'touchmove', u),
            j.unbind(window, 'mouseup', r),
            j.unbind(window, 'touchend', r),
            c();
        }
        function s() {
          j.unbind(window, 'mousemove', h),
            j.unbind(window, 'touchmove', h),
            j.unbind(window, 'mouseup', s),
            j.unbind(window, 'touchend', s),
            c();
        }
        function a() {
          var e = L(this.value);
          !1 !== e
            ? ((f.__color.__state = e), f.setValue(f.__color.toOriginal()))
            : (this.value = f.__color.toString());
        }
        function c() {
          f.__onFinishChange && f.__onFinishChange.call(f, f.__color.toOriginal());
        }
        function u(e) {
          -1 === e.type.indexOf('touch') && e.preventDefault();
          var t = f.__saturation_field.getBoundingClientRect(),
            i = (e.touches && e.touches[0]) || e,
            o = i.clientX,
            n = i.clientY,
            r = (o - t.left) / (t.right - t.left),
            s = 1 - (n - t.top) / (t.bottom - t.top);
          return (
            s > 1 ? (s = 1) : s < 0 && (s = 0),
            r > 1 ? (r = 1) : r < 0 && (r = 0),
            (f.__color.v = s),
            (f.__color.s = r),
            f.setValue(f.__color.toOriginal()),
            !1
          );
        }
        function h(e) {
          -1 === e.type.indexOf('touch') && e.preventDefault();
          var t = f.__hue_field.getBoundingClientRect(),
            i = 1 - (((e.touches && e.touches[0]) || e).clientY - t.top) / (t.bottom - t.top);
          return i > 1 ? (i = 1) : i < 0 && (i = 0), (f.__color.h = 360 * i), f.setValue(f.__color.toOriginal()), !1;
        }
        H(this, t);
        var p = V(this, (t.__proto__ || Object.getPrototypeOf(t)).call(this, e, i));
        (p.__color = new I(p.getValue())), (p.__temp = new I(0));
        var f = p;
        (p.domElement = document.createElement('div')),
          j.makeSelectable(p.domElement, !1),
          (p.__selector = document.createElement('div')),
          (p.__selector.className = 'selector'),
          (p.__saturation_field = document.createElement('div')),
          (p.__saturation_field.className = 'saturation-field'),
          (p.__field_knob = document.createElement('div')),
          (p.__field_knob.className = 'field-knob'),
          (p.__field_knob_border = '2px solid '),
          (p.__hue_knob = document.createElement('div')),
          (p.__hue_knob.className = 'hue-knob'),
          (p.__hue_field = document.createElement('div')),
          (p.__hue_field.className = 'hue-field'),
          (p.__input = document.createElement('input')),
          (p.__input.type = 'text'),
          (p.__input_textShadow = '0 1px 1px '),
          j.bind(p.__input, 'keydown', function (e) {
            13 === e.keyCode && a.call(this);
          }),
          j.bind(p.__input, 'blur', a),
          j.bind(p.__selector, 'mousedown', function () {
            j.addClass(this, 'drag').bind(window, 'mouseup', () => {
              j.removeClass(f.__selector, 'drag');
            });
          }),
          j.bind(p.__selector, 'touchstart', function () {
            j.addClass(this, 'drag').bind(window, 'touchend', () => {
              j.removeClass(f.__selector, 'drag');
            });
          });
        var m = document.createElement('div');
        return (
          k.extend(p.__selector.style, {
            width: '122px',
            height: '102px',
            padding: '3px',
            backgroundColor: '#222',
            boxShadow: '0px 1px 3px rgba(0,0,0,0.3)',
          }),
          k.extend(p.__field_knob.style, {
            position: 'absolute',
            width: '12px',
            height: '12px',
            border: p.__field_knob_border + (p.__color.v < 0.5 ? '#fff' : '#000'),
            boxShadow: '0px 1px 3px rgba(0,0,0,0.5)',
            borderRadius: '12px',
            zIndex: 1,
          }),
          k.extend(p.__hue_knob.style, {
            position: 'absolute',
            width: '15px',
            height: '2px',
            borderRight: '4px solid #fff',
            zIndex: 1,
          }),
          k.extend(p.__saturation_field.style, {
            width: '100px',
            height: '100px',
            border: '1px solid #555',
            marginRight: '3px',
            display: 'inline-block',
            cursor: 'pointer',
          }),
          k.extend(m.style, { width: '100%', height: '100%', background: 'none' }),
          l(m, 'top', 'rgba(0,0,0,0)', '#000'),
          k.extend(p.__hue_field.style, {
            width: '15px',
            height: '100px',
            border: '1px solid #555',
            cursor: 'ns-resize',
            position: 'absolute',
            top: '3px',
            right: '3px',
          }),
          d(p.__hue_field),
          k.extend(p.__input.style, {
            outline: 'none',
            textAlign: 'center',
            color: '#fff',
            border: 0,
            fontWeight: 'bold',
            textShadow: p.__input_textShadow + 'rgba(0,0,0,0.7)',
          }),
          j.bind(p.__saturation_field, 'mousedown', o),
          j.bind(p.__saturation_field, 'touchstart', o),
          j.bind(p.__field_knob, 'mousedown', o),
          j.bind(p.__field_knob, 'touchstart', o),
          j.bind(p.__hue_field, 'mousedown', n),
          j.bind(p.__hue_field, 'touchstart', n),
          p.__saturation_field.appendChild(m),
          p.__selector.appendChild(p.__field_knob),
          p.__selector.appendChild(p.__saturation_field),
          p.__selector.appendChild(p.__hue_field),
          p.__hue_field.appendChild(p.__hue_knob),
          p.domElement.appendChild(p.__input),
          p.domElement.appendChild(p.__selector),
          p.updateDisplay(),
          p
        );
      }
      return (
        D(t, z),
        F(t, [
          {
            key: 'updateDisplay',
            value: function () {
              var e = L(this.getValue());
              if (!1 !== e) {
                var t = !1;
                k.each(
                  I.COMPONENTS,
                  function (i) {
                    if (
                      !k.isUndefined(e[i]) &&
                      !k.isUndefined(this.__color.__state[i]) &&
                      e[i] !== this.__color.__state[i]
                    )
                      return (t = !0), {};
                  },
                  this,
                ),
                  t && k.extend(this.__color.__state, e);
              }
              k.extend(this.__temp.__state, this.__color.__state), (this.__temp.a = 1);
              var i = this.__color.v < 0.5 || this.__color.s > 0.5 ? 255 : 0,
                o = 255 - i;
              k.extend(this.__field_knob.style, {
                marginLeft: 100 * this.__color.s - 7 + 'px',
                marginTop: 100 * (1 - this.__color.v) - 7 + 'px',
                backgroundColor: this.__temp.toHexString(),
                border: this.__field_knob_border + 'rgb(' + i + ',' + i + ',' + i + ')',
              }),
                (this.__hue_knob.style.marginTop = 100 * (1 - this.__color.h / 360) + 'px'),
                (this.__temp.s = 1),
                (this.__temp.v = 1),
                l(this.__saturation_field, 'left', '#fff', this.__temp.toHexString()),
                (this.__input.value = this.__color.toString()),
                k.extend(this.__input.style, {
                  backgroundColor: this.__color.toHexString(),
                  color: 'rgb(' + i + ',' + i + ',' + i + ')',
                  textShadow: this.__input_textShadow + 'rgba(' + o + ',' + o + ',' + o + ',.7)',
                });
            },
          },
        ]),
        t
      );
    })(),
    ee = ['-moz-', '-o-', '-webkit-', '-ms-', ''],
    et = {
      load(e, t) {
        var i = t || document,
          o = i.createElement('link');
        (o.type = 'text/css'), (o.rel = 'stylesheet'), (o.href = e), i.getElementsByTagName('head')[0].appendChild(o);
      },
      inject(e, t) {
        var i = t || document,
          o = document.createElement('style');
        (o.type = 'text/css'), (o.innerHTML = e);
        var n = i.getElementsByTagName('head')[0];
        try {
          n.appendChild(o);
        } catch (r) {}
      },
    },
    ei = (e, t) => {
      var i = e[t];
      return k.isArray(arguments[2]) || k.isObject(arguments[2])
        ? new K(e, t, arguments[2])
        : k.isNumber(i)
          ? k.isNumber(arguments[2]) && k.isNumber(arguments[3])
            ? k.isNumber(arguments[4])
              ? new Q(e, t, arguments[2], arguments[3], arguments[4])
              : new Q(e, t, arguments[2], arguments[3])
            : k.isNumber(arguments[4])
              ? new J(e, t, { min: arguments[2], max: arguments[3], step: arguments[4] })
              : new J(e, t, { min: arguments[2], max: arguments[3] })
          : k.isString(i)
            ? new Y(e, t)
            : k.isFunction(i)
              ? new q(e, t, '')
              : k.isBoolean(i)
                ? new X(e, t)
                : null;
    },
    eo =
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      ((e) => {
        setTimeout(e, 1e3 / 60);
      }),
    en = (() => {
      function e() {
        H(this, e),
          (this.backgroundElement = document.createElement('div')),
          k.extend(this.backgroundElement.style, {
            backgroundColor: 'rgba(0,0,0,0.8)',
            top: 0,
            left: 0,
            display: 'none',
            zIndex: '1000',
            opacity: 0,
            WebkitTransition: 'opacity 0.2s linear',
            transition: 'opacity 0.2s linear',
          }),
          j.makeFullscreen(this.backgroundElement),
          (this.backgroundElement.style.position = 'fixed'),
          (this.domElement = document.createElement('div')),
          k.extend(this.domElement.style, {
            position: 'fixed',
            display: 'none',
            zIndex: '1001',
            opacity: 0,
            WebkitTransition: '-webkit-transform 0.2s ease-out, opacity 0.2s linear',
            transition: 'transform 0.2s ease-out, opacity 0.2s linear',
          }),
          document.body.appendChild(this.backgroundElement),
          document.body.appendChild(this.domElement),
          j.bind(this.backgroundElement, 'click', () => {
            this.hide();
          });
      }
      return (
        F(e, [
          {
            key: 'show',
            value: function () {
              (this.backgroundElement.style.display = 'block'),
                (this.domElement.style.display = 'block'),
                (this.domElement.style.opacity = 0),
                (this.domElement.style.webkitTransform = 'scale(1.1)'),
                this.layout(),
                k.defer(() => {
                  (this.backgroundElement.style.opacity = 1),
                    (this.domElement.style.opacity = 1),
                    (this.domElement.style.webkitTransform = 'scale(1)');
                });
            },
          },
          {
            key: 'hide',
            value: function () {
              var e = this,
                t = function t() {
                  (e.domElement.style.display = 'none'),
                    (e.backgroundElement.style.display = 'none'),
                    j.unbind(e.domElement, 'webkitTransitionEnd', t),
                    j.unbind(e.domElement, 'transitionend', t),
                    j.unbind(e.domElement, 'oTransitionEnd', t);
                };
              j.bind(this.domElement, 'webkitTransitionEnd', t),
                j.bind(this.domElement, 'transitionend', t),
                j.bind(this.domElement, 'oTransitionEnd', t),
                (this.backgroundElement.style.opacity = 0),
                (this.domElement.style.opacity = 0),
                (this.domElement.style.webkitTransform = 'scale(1.1)');
            },
          },
          {
            key: 'layout',
            value: function () {
              (this.domElement.style.left = window.innerWidth / 2 - j.getWidth(this.domElement) / 2 + 'px'),
                (this.domElement.style.top = window.innerHeight / 2 - j.getHeight(this.domElement) / 2 + 'px');
            },
          },
        ]),
        e
      );
    })(),
    er = ((e) => {
      if (e && 'undefined' != typeof window) {
        var t = document.createElement('style');
        return t.setAttribute('type', 'text/css'), (t.innerHTML = e), document.head.appendChild(t), e;
      }
    })(
      ".dg ul{list-style:none;margin:0;padding:0;width:100%;clear:both}.dg.ac{position:fixed;top:0;left:0;right:0;height:0;z-index:0}.dg:not(.ac) .main{overflow:hidden}.dg.main{-webkit-transition:opacity .1s linear;-o-transition:opacity .1s linear;-moz-transition:opacity .1s linear;transition:opacity .1s linear}.dg.main.taller-than-window{overflow-y:auto}.dg.main.taller-than-window .close-button{opacity:1;margin-top:-1px;border-top:1px solid #2c2c2c}.dg.main ul.closed .close-button{opacity:1 !important}.dg.main:hover .close-button,.dg.main .close-button.drag{opacity:1}.dg.main .close-button{-webkit-transition:opacity .1s linear;-o-transition:opacity .1s linear;-moz-transition:opacity .1s linear;transition:opacity .1s linear;border:0;line-height:19px;height:20px;cursor:pointer;text-align:center;background-color:#000}.dg.main .close-button.close-top{position:relative}.dg.main .close-button.close-bottom{position:absolute}.dg.main .close-button:hover{background-color:#111}.dg.a{float:right;margin-right:15px;overflow-y:visible}.dg.a.has-save>ul.close-top{margin-top:0}.dg.a.has-save>ul.close-bottom{margin-top:27px}.dg.a.has-save>ul.closed{margin-top:0}.dg.a .save-row{top:0;z-index:1002}.dg.a .save-row.close-top{position:relative}.dg.a .save-row.close-bottom{position:fixed}.dg li{-webkit-transition:height .1s ease-out;-o-transition:height .1s ease-out;-moz-transition:height .1s ease-out;transition:height .1s ease-out;-webkit-transition:overflow .1s linear;-o-transition:overflow .1s linear;-moz-transition:overflow .1s linear;transition:overflow .1s linear}.dg li:not(.folder){cursor:auto;height:27px;line-height:27px;padding:0 4px 0 5px}.dg li.folder{padding:0;border-left:4px solid rgba(0,0,0,0)}.dg li.title{cursor:pointer;margin-left:-4px}.dg .closed li:not(.title),.dg .closed ul li,.dg .closed ul li>*{height:0;overflow:hidden;border:0}.dg .cr{clear:both;padding-left:3px;height:27px;overflow:hidden}.dg .property-name{cursor:default;float:left;clear:left;width:40%;overflow:hidden;text-overflow:ellipsis}.dg .c{float:left;width:60%;position:relative}.dg .c input[type=text]{border:0;margin-top:4px;padding:3px;width:100%;float:right}.dg .has-slider input[type=text]{width:30%;margin-left:0}.dg .slider{float:left;width:66%;margin-left:-5px;margin-right:0;height:19px;margin-top:4px}.dg .slider-fg{height:100%}.dg .c input[type=checkbox]{margin-top:7px}.dg .c select{margin-top:5px}.dg .cr.function,.dg .cr.function .property-name,.dg .cr.function *,.dg .cr.boolean,.dg .cr.boolean *{cursor:pointer}.dg .cr.color{overflow:visible}.dg .selector{display:none;position:absolute;margin-left:-9px;margin-top:23px;z-index:10}.dg .c:hover .selector,.dg .selector.drag{display:block}.dg li.save-row{padding:0}.dg li.save-row .button{display:inline-block;padding:0px 6px}.dg.dialogue{background-color:#222;width:460px;padding:15px;font-size:13px;line-height:15px}#dg-new-constructor{padding:10px;color:#222;font-family:Monaco, monospace;font-size:10px;border:0;resize:none;box-shadow:inset 1px 1px 1px #888;word-wrap:break-word;margin:12px 0;display:block;width:440px;overflow-y:scroll;height:100px;position:relative}#dg-local-explain{display:none;font-size:11px;line-height:17px;border-radius:3px;background-color:#333;padding:8px;margin-top:10px}#dg-local-explain code{font-size:10px}#dat-gui-save-locally{display:none}.dg{color:#eee;font:11px 'Lucida Grande', sans-serif;text-shadow:0 -1px 0 #111}.dg.main::-webkit-scrollbar{width:5px;background:#1a1a1a}.dg.main::-webkit-scrollbar-corner{height:0;display:none}.dg.main::-webkit-scrollbar-thumb{border-radius:5px;background:#676767}.dg li:not(.folder){background:#1a1a1a;border-bottom:1px solid #2c2c2c}.dg li.save-row{line-height:25px;background:#dad5cb;border:0}.dg li.save-row select{margin-left:5px;width:108px}.dg li.save-row .button{margin-left:5px;margin-top:1px;border-radius:2px;font-size:9px;line-height:7px;padding:4px 4px 5px 4px;background:#c5bdad;color:#fff;text-shadow:0 1px 0 #b0a58f;box-shadow:0 -1px 0 #b0a58f;cursor:pointer}.dg li.save-row .button.gears{background:#c5bdad url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAANCAYAAAB/9ZQ7AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQJJREFUeNpiYKAU/P//PwGIC/ApCABiBSAW+I8AClAcgKxQ4T9hoMAEUrxx2QSGN6+egDX+/vWT4e7N82AMYoPAx/evwWoYoSYbACX2s7KxCxzcsezDh3evFoDEBYTEEqycggWAzA9AuUSQQgeYPa9fPv6/YWm/Acx5IPb7ty/fw+QZblw67vDs8R0YHyQhgObx+yAJkBqmG5dPPDh1aPOGR/eugW0G4vlIoTIfyFcA+QekhhHJhPdQxbiAIguMBTQZrPD7108M6roWYDFQiIAAv6Aow/1bFwXgis+f2LUAynwoIaNcz8XNx3Dl7MEJUDGQpx9gtQ8YCueB+D26OECAAQDadt7e46D42QAAAABJRU5ErkJggg==) 2px 1px no-repeat;height:7px;width:8px}.dg li.save-row .button:hover{background-color:#bab19e;box-shadow:0 -1px 0 #b0a58f}.dg li.folder{border-bottom:0}.dg li.title{padding-left:16px;background:#000 url(data:image/gif;base64,R0lGODlhBQAFAJEAAP////Pz8////////yH5BAEAAAIALAAAAAAFAAUAAAIIlI+hKgFxoCgAOw==) 6px 10px no-repeat;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.2)}.dg .closed li.title{background-image:url(data:image/gif;base64,R0lGODlhBQAFAJEAAP////Pz8////////yH5BAEAAAIALAAAAAAFAAUAAAIIlGIWqMCbWAEAOw==)}.dg .cr.boolean{border-left:3px solid #806787}.dg .cr.color{border-left:3px solid}.dg .cr.function{border-left:3px solid #e61d5f}.dg .cr.number{border-left:3px solid #2FA1D6}.dg .cr.number input[type=text]{color:#2FA1D6}.dg .cr.string{border-left:3px solid #1ed36f}.dg .cr.string input[type=text]{color:#1ed36f}.dg .cr.function:hover,.dg .cr.boolean:hover{background:#111}.dg .c input[type=text]{background:#303030;outline:none}.dg .c input[type=text]:hover{background:#3c3c3c}.dg .c input[type=text]:focus{background:#494949;color:#fff}.dg .c .slider{background:#303030;cursor:ew-resize}.dg .c .slider-fg{background:#2FA1D6;max-width:100%}.dg .c .slider:hover{background:#3c3c3c}.dg .c .slider:hover .slider-fg{background:#44abda}\n",
    );
  et.inject(er);
  var es = 'Default',
    ea = (() => {
      try {
        return !!window.localStorage;
      } catch (e) {
        return !1;
      }
    })(),
    el = void 0,
    ed = !0,
    ec = void 0,
    e8 = !1,
    eu = [],
    eh = function e(t) {
      var i,
        o = this,
        n = t || {};
      (this.domElement = document.createElement('div')),
        (this.__ul = document.createElement('ul')),
        this.domElement.appendChild(this.__ul),
        j.addClass(this.domElement, 'dg'),
        (this.__folders = {}),
        (this.__controllers = []),
        (this.__rememberedObjects = []),
        (this.__rememberedObjectIndecesToControllers = []),
        (this.__listening = []),
        (n = k.defaults(n, { closeOnTop: !1, autoPlace: !0, width: e.DEFAULT_WIDTH })),
        (n = k.defaults(n, { resizable: n.autoPlace, hideable: n.autoPlace })),
        k.isUndefined(n.load) ? (n.load = { preset: es }) : n.preset && (n.load.preset = n.preset),
        k.isUndefined(n.parent) && n.hideable && eu.push(this),
        (n.resizable = k.isUndefined(n.parent) && n.resizable),
        n.autoPlace && k.isUndefined(n.scrollable) && (n.scrollable = !0);
      var r = ea && 'true' === localStorage.getItem(g(this, 'isLocal')),
        s = void 0;
      if (
        (Object.defineProperties(this, {
          parent: { get: () => n.parent },
          scrollable: { get: () => n.scrollable },
          autoPlace: { get: () => n.autoPlace },
          closeOnTop: { get: () => n.closeOnTop },
          preset: {
            get: () => (o.parent ? o.getRoot().preset : n.load.preset),
            set: function (e) {
              o.parent ? (o.getRoot().preset = e) : (n.load.preset = e), E(this), o.revert();
            },
          },
          width: {
            get: () => n.width,
            set(e) {
              (n.width = e), x(o, e);
            },
          },
          name: {
            get: () => n.name,
            set(e) {
              (n.name = e), titleRowName && (titleRowName.innerHTML = n.name);
            },
          },
          closed: {
            get: () => n.closed,
            set: function (t) {
              (n.closed = t),
                n.closed ? j.addClass(o.__ul, e.CLASS_CLOSED) : j.removeClass(o.__ul, e.CLASS_CLOSED),
                this.onResize(),
                o.__closeButton && (o.__closeButton.innerHTML = t ? e.TEXT_OPEN : e.TEXT_CLOSED);
            },
          },
          load: { get: () => n.load },
          useLocalStorage: {
            get: () => r,
            set(e) {
              ea &&
                ((r = e),
                e ? j.bind(window, 'unload', s) : j.unbind(window, 'unload', s),
                localStorage.setItem(g(o, 'isLocal'), e));
            },
          },
        }),
        k.isUndefined(n.parent))
      ) {
        if (
          ((n.closed = !1), j.addClass(this.domElement, e.CLASS_MAIN), j.makeSelectable(this.domElement, !1), ea && r)
        ) {
          o.useLocalStorage = !0;
          var a = localStorage.getItem(g(this, 'gui'));
          a && (n.load = JSON.parse(a));
        }
        (this.__closeButton = document.createElement('div')),
          (this.__closeButton.innerHTML = e.TEXT_CLOSED),
          j.addClass(this.__closeButton, e.CLASS_CLOSE_BUTTON),
          n.closeOnTop
            ? (j.addClass(this.__closeButton, e.CLASS_CLOSE_TOP),
              this.domElement.insertBefore(this.__closeButton, this.domElement.childNodes[0]))
            : (j.addClass(this.__closeButton, e.CLASS_CLOSE_BOTTOM), this.domElement.appendChild(this.__closeButton)),
          j.bind(this.__closeButton, 'click', () => {
            o.closed = !o.closed;
          });
      } else {
        void 0 === n.closed && (n.closed = !0);
        var l = document.createTextNode(n.name);
        j.addClass(l, 'controller-name');
        var d = c(o, l);
        j.addClass(this.__ul, e.CLASS_CLOSED),
          j.addClass(d, 'title'),
          j.bind(d, 'click', (e) => (e.preventDefault(), (o.closed = !o.closed), !1)),
          n.closed || (this.closed = !1);
      }
      n.autoPlace &&
        (k.isUndefined(n.parent) &&
          (ed &&
            ((ec = document.createElement('div')),
            j.addClass(ec, 'dg'),
            j.addClass(ec, e.CLASS_AUTO_PLACE_CONTAINER),
            document.body.appendChild(ec),
            (ed = !1)),
          ec.appendChild(this.domElement),
          j.addClass(this.domElement, e.CLASS_AUTO_PLACE)),
        this.parent || x(o, n.width)),
        (this.__resizeHandler = () => {
          o.onResizeDebounced();
        }),
        j.bind(window, 'resize', this.__resizeHandler),
        j.bind(this.__ul, 'webkitTransitionEnd', this.__resizeHandler),
        j.bind(this.__ul, 'transitionend', this.__resizeHandler),
        j.bind(this.__ul, 'oTransitionEnd', this.__resizeHandler),
        this.onResize(),
        n.resizable && y(this),
        (s = () => {
          ea &&
            'true' === localStorage.getItem(g(o, 'isLocal')) &&
            localStorage.setItem(g(o, 'gui'), JSON.stringify(o.getSaveObject()));
        }),
        (this.saveToLocalStorageIfPossible = s),
        n.parent ||
          ((i = o.getRoot()),
          (i.width += 1),
          k.defer(() => {
            i.width -= 1;
          }));
    };
  (eh.toggleHide = () => {
    (e8 = !e8),
      k.each(eu, (e) => {
        e.domElement.style.display = e8 ? 'none' : '';
      });
  }),
    (eh.CLASS_AUTO_PLACE = 'a'),
    (eh.CLASS_AUTO_PLACE_CONTAINER = 'ac'),
    (eh.CLASS_MAIN = 'main'),
    (eh.CLASS_CONTROLLER_ROW = 'cr'),
    (eh.CLASS_TOO_TALL = 'taller-than-window'),
    (eh.CLASS_CLOSED = 'closed'),
    (eh.CLASS_CLOSE_BUTTON = 'close-button'),
    (eh.CLASS_CLOSE_TOP = 'close-top'),
    (eh.CLASS_CLOSE_BOTTOM = 'close-bottom'),
    (eh.CLASS_DRAG = 'drag'),
    (eh.DEFAULT_WIDTH = 245),
    (eh.TEXT_CLOSED = 'Close Controls'),
    (eh.TEXT_OPEN = 'Open Controls'),
    (eh._keydownHandler = (e) => {
      'text' === document.activeElement.type || (72 !== e.which && 72 !== e.keyCode) || eh.toggleHide();
    }),
    j.bind(window, 'keydown', eh._keydownHandler, !1),
    k.extend(eh.prototype, {
      add: function (e, t) {
        return m(this, e, t, { factoryArgs: Array.prototype.slice.call(arguments, 2) });
      },
      addColor: function (e, t) {
        return m(this, e, t, { color: !0 });
      },
      remove: function (e) {
        this.__ul.removeChild(e.__li),
          this.__controllers.splice(this.__controllers.indexOf(e), 1),
          k.defer(() => {
            this.onResize();
          });
      },
      destroy: function () {
        if (this.parent)
          throw Error(
            'Only the root GUI should be removed with .destroy(). For subfolders, use gui.removeFolder(folder) instead.',
          );
        this.autoPlace && ec.removeChild(this.domElement),
          k.each(this.__folders, (e) => {
            this.removeFolder(e);
          }),
          j.unbind(window, 'keydown', eh._keydownHandler, !1),
          u(this);
      },
      addFolder: function (e) {
        if (void 0 !== this.__folders[e]) throw Error('You already have a folder in this GUI by the name "' + e + '"');
        var t = { name: e, parent: this };
        (t.autoPlace = this.autoPlace),
          this.load &&
            this.load.folders &&
            this.load.folders[e] &&
            ((t.closed = this.load.folders[e].closed), (t.load = this.load.folders[e]));
        var i = new eh(t);
        this.__folders[e] = i;
        var o = c(this, i.domElement);
        return j.addClass(o, 'folder'), i;
      },
      removeFolder: function (e) {
        this.__ul.removeChild(e.domElement.parentElement),
          delete this.__folders[e.name],
          this.load && this.load.folders && this.load.folders[e.name] && delete this.load.folders[e.name],
          u(e),
          k.each(e.__folders, (t) => {
            e.removeFolder(t);
          }),
          k.defer(() => {
            this.onResize();
          });
      },
      open: function () {
        this.closed = !1;
      },
      close: function () {
        this.closed = !0;
      },
      onResize: function () {
        var e = this.getRoot();
        if (e.scrollable) {
          var t = j.getOffset(e.__ul).top,
            i = 0;
          k.each(e.__ul.childNodes, (t) => {
            (e.autoPlace && t === e.__save_row) || (i += j.getHeight(t));
          }),
            window.innerHeight - t - 20 < i
              ? (j.addClass(e.domElement, eh.CLASS_TOO_TALL),
                (e.__ul.style.height = window.innerHeight - t - 20 + 'px'))
              : (j.removeClass(e.domElement, eh.CLASS_TOO_TALL), (e.__ul.style.height = 'auto'));
        }
        e.__resize_handle &&
          k.defer(() => {
            e.__resize_handle.style.height = e.__ul.offsetHeight + 'px';
          }),
          e.__closeButton && (e.__closeButton.style.width = e.width + 'px');
      },
      onResizeDebounced: k.debounce(function () {
        this.onResize();
      }, 50),
      remember: function () {
        if (
          (k.isUndefined(el) &&
            ((el = new en()).domElement.innerHTML =
              '<div id="dg-save" class="dg dialogue">\n\n  Here\'s the new load parameter for your <code>GUI</code>\'s constructor:\n\n  <textarea id="dg-new-constructor"></textarea>\n\n  <div id="dg-save-locally">\n\n    <input id="dg-local-storage" type="checkbox"/> Automatically save\n    values to <code>localStorage</code> on exit.\n\n    <div id="dg-local-explain">The values saved to <code>localStorage</code> will\n      override those passed to <code>dat.GUI</code>\'s constructor. This makes it\n      easier to work incrementally, but <code>localStorage</code> is fragile,\n      and your friends may not see the same values you do.\n\n    </div>\n\n  </div>\n\n</div>'),
          this.parent)
        )
          throw Error('You can only call remember on a top level GUI.');
        k.each(Array.prototype.slice.call(arguments), (e) => {
          0 === this.__rememberedObjects.length && $(this),
            -1 === this.__rememberedObjects.indexOf(e) && this.__rememberedObjects.push(e);
        }),
          this.autoPlace && x(this, this.width);
      },
      getRoot: function () {
        for (var e = this; e.parent; ) e = e.parent;
        return e;
      },
      getSaveObject: function () {
        var e = this.load;
        return (
          (e.closed = this.closed),
          this.__rememberedObjects.length > 0 &&
            ((e.preset = this.preset), e.remembered || (e.remembered = {}), (e.remembered[this.preset] = _(this))),
          (e.folders = {}),
          k.each(this.__folders, (t, i) => {
            e.folders[i] = t.getSaveObject();
          }),
          e
        );
      },
      save: function () {
        this.load.remembered || (this.load.remembered = {}),
          (this.load.remembered[this.preset] = _(this)),
          h(this, !1),
          this.saveToLocalStorageIfPossible();
      },
      saveAs: function (e) {
        this.load.remembered || ((this.load.remembered = {}), (this.load.remembered[es] = _(this, !0))),
          (this.load.remembered[e] = _(this)),
          (this.preset = e),
          b(this, e, !0),
          this.saveToLocalStorageIfPossible();
      },
      revert: function (e) {
        k.each(
          this.__controllers,
          function (t) {
            this.getRoot().load.remembered ? f(e || this.getRoot(), t) : t.setValue(t.initialValue),
              t.__onFinishChange && t.__onFinishChange.call(t, t.getValue());
          },
          this,
        ),
          k.each(this.__folders, (e) => {
            e.revert(e);
          }),
          e || h(this.getRoot(), !1);
      },
      listen: function (e) {
        var t = 0 === this.__listening.length;
        this.__listening.push(e), t && C(this.__listening);
      },
      updateDisplay: function () {
        k.each(this.__controllers, (e) => {
          e.updateDisplay();
        }),
          k.each(this.__folders, (e) => {
            e.updateDisplay();
          });
      },
    });
  var ep = { Color: I, math: B, interpret: L },
    ef = {
      Controller: z,
      BooleanController: X,
      OptionController: K,
      StringController: Y,
      NumberController: W,
      NumberControllerBox: J,
      NumberControllerSlider: Q,
      FunctionController: q,
      ColorController: Z,
    },
    em = { dom: j },
    eg = { GUI: eh },
    eb = eh,
    ev = { color: ep, controllers: ef, dom: em, gui: eg, GUI: eb };
  (e.color = ep),
    (e.controllers = ef),
    (e.dom = em),
    (e.gui = eg),
    (e.GUI = eb),
    (e.default = ev),
    Object.defineProperty(e, '__esModule', { value: !0 });
});
