(function(global, factory) {
  //TODO promise polyfill
  factory(global);
})(this, function(exports) {
  'use strict';

  var slice = Array.prototype.slice;

  //do nothing
  var noop = function noop() {}

  //return self
  var identify = function identify(a) {
    return a
  }

  var $typeof = function(v) {
    return typeof v
  }

  //Throw an exception when 'a' equal false
  var assert = console.assert ? console.assert : function assert(a, msg) {
    if (a === false) throw new Error(msg)
  }

  //placeholder
  var _ = Symbol ?
    Symbol('report.chart.either._') : {
      Symbol: 'report.chart.either._'
    };

  //currying
  function curry() {
    var fn = arguments[0];
    var _args = slice.call(arguments, 1);
    return function() {
      var args = slice.call(arguments)
      var useArgs = [];
      for (var i = 0, len = _args.length; i < len; i++) {
        var arg = _args[i];
        useArgs.push(arg !== _ ? arg : args.shift());
      }
      fn.apply(this, useArgs)
    }
  }

  //promise life cycle
  var $state = {
    fulfilled: 'fulfilled',
    pending: 'pending',
    rejected: 'rejected',
  }
  Object.freeze($state);

  //when promise state changed, this key save the result
  var $$result = '[[PromiseResult]]';
  //promise state
  var $$State = '[[PromiseState]]';

  //Constructor
  var _Promise = function(executor) {
    assert(this instanceof _Promise, 'Constructor Promise requires \'new\'');
    assert($typeof(executor) === 'function', 'parameter 1 must be a function');

    this[$$State] = $state.pending;
    this[$$result] = undefined;
    this._resolveQueen = [];
    this._rejectQueen = [];
    var resolve = getExecutor(this, $state.fulfilled);
    var reject = getExecutor(this, $state.rejected);
    try {
      executor(resolve, reject);
    } catch (err) {
      reject(err);
    }
  }

  function getExecutor(context, state) {
    return function(result) {
      changeStatus(context, state, result) || trigger(context);
    }
  }

  //change prom state
  //Return true when prom.state change is blocked
  function changeStatus(prom, state, result) {
    if (prom[$$State] !== $state.pending) return true;
    prom[$$State] = state;
    prom[$$result] = result;
    Object.freeze(prom);
  }

  //clear prom's callback queen
  function trigger(prom) {
    if (prom[$$State] === $state.pending) return;

    var state = prom[$$State] === $state.fulfilled;
    var queen = state ? prom._resolveQueen : prom._rejectQueen;
    var cb;
    while (cb = queen.shift()) {
      cb(prom[$$result])
    }
  }


  _Promise.prototype.then = function(onFulfilled, onRejected) {
    assert($typeof(onFulfilled) === 'function', 'onFulfilled must be a function');
    assert(['function', 'undefined'].indexOf($typeof(onFulfilled)) > -1, 'onRejected must be a function');

    var prom = new this.constructor(noop);
    handler(onFulfilled, onRejected, this, prom);
    return prom
  }

  _Promise.prototype.catch = function(onRejected) {
    assert($typeof(onRejected) === 'function', 'onRejected must be a function');

    var prom = new this.constructor(noop);
    handler(identify, onRejected, this, prom);
    return prom;
  }

  _Promise.prototype.finally = function(onFinally) {
    assert($typeof(onFinally) === 'function', 'onFinally must be a function');
    var f = function f(result) {
      onFinally();
    }
    return this.then(f, f);
  }

  //Correlation prev and next promise
  function handler(onFulfilled, onRejected, prevProm, nextProm) {
    if (onFulfilled === undefined) onFulfilled = identify;
    if (onRejected === undefined) onRejected = identify;

    var changeNextResolve = curry(changeStatus, nextProm, $state.fulfilled, _);
    var changeNextReject = curry(changeStatus, nextProm, $state.rejected, _);
    var triggerNext = curry(trigger, nextProm);

    prevProm._resolveQueen.push(correlation(onFulfilled));
    prevProm._rejectQueen.push(correlation(onRejected));

    trigger(prevProm);

    function correlation(handler) {
      return function(result) {
        var value = handler(result);
        if (value instanceof _Promise) {
          value.then(function(res) {
            changeNextResolve(res);
            triggerNext();
          }, function(res) {
            changeNextReject(res);
            triggerNext();
          })
        } else {
          changeNextResolve(value);
          triggerNext();
        }
      }
    }
  }
  //--------------------end Promise.prototype--------------------


  //--------------------static methods--------------------
  _Promise.resolve = function(result) {
    return new Promise(function(resolve) {
      resolve(result)
    })
  }

  _Promise.reject = function(result) {
    return new Promise(function(resolve, reject) {
      reject(result)
    })
  }

  _Promise.race = function(list) {
    //assert
    var context = this;
    return new this.constructor(function(resolve, reject) {
      for (var p of list) {
        context.resolve(p).then(function(res) {
          resolve(res)
        }, function(err) {
          reject(err)
        })
      }
    })
  }

  //TODO  ------------------------------------------------------
  _Promise.all = function(list) {
    var context = this;
    return new this.constructor((resolve, reject) => {
      var values = [];
      var count = 0;
      
    })
  }

  _Promise.any = function() {
    var context = this;
    return new this.constructor((resolve, reject) => {})
  }



  exports.Promise = _Promise;
})