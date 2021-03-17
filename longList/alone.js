(function(global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    factory(module.exports);
  } else {
    factory(global);
  }
})(typeof window !== "undefined" ? window : this, function(exports) {

  'use strict'

  var idx = 0;

  function noop() {}

  function getId() {
    return idx++ + '';
  }

  //preform call function once per frame
  function throttle(fn) {
    var queue = []; //队列
    var req = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame ||
      function(callback) {
        window.setTimeout(callback, 1000 / 60);
      };

    return function(...arg) {
      if (queue.length === 0) {
        req(() => {
          if (queue.length) {
            fn.apply(this, queue.pop());
            queue = [];
          }
        });
      }
      queue.push(arg)
    }
  }

  function parInt(v) {
    return v | 0
  }

  function sliceFor(start, end, fn) {
    for (var i = start; i < end; i++) {
      fn(i)
    }
  }

  function insertBefore(newElement, targetElement) {
    var parent = targetElement.parentNode;
    parent.insertBefore(newElement, targetElement);
  }

  function remove(el) {
    el.parentNode.removeChild(el);
  }

  //constructor
  function Alone(config) {
    if (!(this instanceof Alone)) return new Alone(...arguments);
    this.config = {}
    this.init(config)
  }


  Alone.prototype.init = function({
    el, //锚点
    size, //子元素数量
    render, //渲染函数
    sampling = 10, //采样数量  较小的影响首屏加载速度
    scale = .5, //头尾的数量 计算方式为显示数量的倍数
  }) {
    var config = this.config;
    var maxHeight = 33000000; //浏览器最大高度 33554400

    this.el = el;
    this.cache = new Array(size);
    this.render = render || noop;

    if (this.id === undefined) {
      this.id = getId();
    }

    sliceFor(0, sampling > size ? size : sampling, (i) => {
      el.appendChild(this.getElement(i));
    })

    var sumHeight = 0;
    sliceFor(0, el.children.length, function(i) {
      sumHeight += el.children[i].offsetHeight
    })

    //单个元素的平均大小  (根据采样数量计算得出)
    var nodeHeight = sumHeight / sampling;
    //根节点高度
    var rootHeight = el.offsetHeight;
    //视窗元素数量(模糊值,非整数)
    var viewSize = rootHeight / nodeHeight;
    //实际滚动高度
    var actScrollHeight = nodeHeight * size;
    //总滚动距离
    var scrollHeight = actScrollHeight > maxHeight ? maxHeight : actScrollHeight;

    var magnification = scrollHeight / actScrollHeight;


    Object.assign(config, {
      size,
      scale,
      startIdx: 0,
      endIdx: el.children.length,
      viewSize,
      nodeHeight,
      rootHeight,
      startViewIdx: 0,
      scrollHeight,
      magnification,
      actScrollHeight
    })

    this.addRule();
    this.addEvent();
    el.classList.add('alone')
    el.classList.add('alone' + this.id);

    if (this.cache.length > 0) {
      this.turnTo(0);
      el.scrollTop = 0
    }
  }

  Alone.prototype.scrollTo = function(num) {
    var {
      scrollHeight,
      size
    } = this.config;
    num = num > size ? size : num;
    this.el.scrollTop = parInt(scrollHeight * num / size);
  }

  Alone.prototype.addEvent = function() {
    var {
      event,
    } = this.config;
    if (event) return;

    var that = this;
    //添加或删除元素后,有时会出现抖动问题,此属性标记上次和下次的位移距离当位移大于30时
    //触发回调函数
    var gap = 0;

    var scroll = this.config.event = throttle(function(e) {
      var st = this.scrollTop;
      //防抖动
      if (Math.abs(st - gap) <= 30) return;
      gap = st;
      var num = Math.round(st / that.config.scrollHeight * that.config.size);

      that.turnTo(num);
    });

    this.el.addEventListener('scroll', scroll)
  }

  Alone.prototype.getElement = function(idx) {
    var {
      cache,
      render
    } = this;
    var node = cache[idx];
    if (node === undefined) {
      cache[idx] = render(idx)
    } else if (typeof node === 'function') {
      cache[idx] = node(idx)
    }
    return cache[idx];
  }

  Alone.prototype.turnTo = function(startViewIdx) {
    var {
      el,
      config,
    } = this;

    var {
      size,
      scale,
      viewSize,
      startIdx: nowStartIdx = 0,
      endIdx: nowEndIdx = 1,
    } = config;

    var startIdx = parInt(startViewIdx - viewSize * scale);
    if (startIdx < 0) startIdx = 0;

    var endIdx = parInt(startIdx + viewSize * (1 + scale * 2));
    //极值处理
    if (endIdx >= size) {
      endIdx = size;
    }

    var nowEl = el.children;
    var isZeroLength = nowEl.length === 0;
    var zeroEl = nowEl[0]

    //头添加/删除
    if (startIdx > nowStartIdx) {
      sliceFor(nowStartIdx, startIdx > nowEndIdx ? nowEndIdx : startIdx, (v) => {
        var el = this.getElement(v);
        remove(el);
      })
    } else {
      sliceFor(startIdx, nowStartIdx > endIdx ? endIdx : nowStartIdx, (v) => {
        var node = this.getElement(v);
        if (isZeroLength) {
          el.appendChild(node)
        } else {
          insertBefore(node, zeroEl)
        }
      })
    }

    //尾添加/删除
    if (nowEndIdx > endIdx) {
      sliceFor(endIdx < nowStartIdx ? nowStartIdx : endIdx, nowEndIdx, (v) => {
        var el = this.getElement(v);
        remove(el);
      })
    } else {
      //展示内容相交和不相交用三目运算符判断
      sliceFor(nowEndIdx < startIdx ? startIdx : nowEndIdx, endIdx, (v) => {
        var c = this.getElement(v);
        el.appendChild(c)
      })
    }

    config.startIdx = startIdx;
    config.endIdx = endIdx;
    this.setRule();
  }


  Alone.prototype.addRule = function() {
    if (this.style === undefined) {
      this.style = document.createElement('style');
      document.head.appendChild(this.style)
    }
  }

  Alone.prototype.setRule = function() {
    var config = this.config;
    var size = config.size;
    var startIdx = config.startIdx;
    var endIdx = config.endIdx;
    var nodeHeight = config.nodeHeight;
    var scrollHeight = config.scrollHeight;
    var relativeHeight = scrollHeight - nodeHeight * (endIdx - startIdx);
    var before = relativeHeight * startIdx / (size - (endIdx - startIdx));
    var after = relativeHeight - before;
    before = parInt(before);
    after = parInt(after);

    var id = this.id;
    var sheet = this.style.sheet;
    while (sheet.cssRules.length > 0) {
      sheet.deleteRule(0)
    }
    sheet.insertRule(`.alone${id}::before{content:'';display:block;height:${before}px;width:100%;}`, 0)
    sheet.insertRule(`.alone${id}::after{content:'';display:block;height:${after}px;width:100%;}`, 0)
  }

  Alone.prototype.destroy = function() {
    this.el.removeEventListener('scroll', this.config.event);
    this.el.classList.remove('alone' + this.id)
    remove(this.style);
    this.el.innerHTML = '';
    this.cache = null;
  }

  exports.Alone = Alone;
})