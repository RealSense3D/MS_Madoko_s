/*---------------------------------------------------------------------------
  Copyright 2013 Microsoft Corporation.
 
  This is free software; you can redistribute it and/or modify it under the
  terms of the Apache License, Version 2.0. A copy of the License can be
  found in the file "license.txt" at the root of this distribution.
---------------------------------------------------------------------------*/

define(["std_core","std_path","../scripts/promise","../scripts/map"],
        function(Stdcore,Stdpath,Promise,Map) {

  var Msg = { 
    Normal: "normal", 
    Info: "info", 
    Warning: "warning", 
    Error: "error", 
    Exn: "exception",
    Status: "status",
    Tool: "tool",
    Trace: "trace",
    Prof: "prof",
  };

  var status;
  var consoleOut;
  var iconOk;
  var iconWarn;
  if (typeof document !== "undefined") {
    status     = document.getElementById("status");
    consoleOut = document.getElementById("console-out");
    iconOk     = document.getElementById("console-ok");
    iconWarn   = document.getElementById("console-warn");
  }

  var escapes = {
      '&': '&amp;', // & first!
      '<': '&lt;',
      '>': '&gt;',
      '\'': '&apos;',
      '"': '&quot;',
      '\n': '<br>',
      '\r': '',
      ' ': '&nbsp;',
  };
  var escapes_regex = new RegExp("[" + Object.keys(escapes).join("") + "]", "g");

  function htmlEscape(txt) {
    return txt.replace(escapes_regex, function (s) {
      var r = escapes[s];
      return (r ? r : "");
    });
  }
  
  function stringEscape(txt) {
    return txt.replace(/["'\\\n\r]/g, function(s) {
      if (s==="\n") return "\\n";
      else if (s==="\r") return "\\r";
      else return "\\" + s;
    });
  }

  function spanLines(html,cls) {
    return html.replace(/(^|<br>)(.*?)(?=<br>|$)/g, "$1<span class='" + cls + "'>$2</span>");
  }

  function capitalize(s) {
    if (!s || typeof(s) !== "string") return s;
    return (s.substr(0,1).toUpperCase() + s.substr(1));
  }

  var maxConsole = 8*1024;

  var messageTimeout = 0;

  function setStatusHTML( html ) {
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout( function() { status.innerHTML = ""; }, 10000 ); // fade after 10 secs
    status.innerHTML = html;
  }

  // Call for messages
  function message( msg, kind ) {
    var linkFun = null;
    var txt = "";

    if (typeof msg === "object") {
      if (msg.stack) {
        console.log(msg.stack);
      }

      if (msg.url && typeof msg.url === "string") {
        linkFun = function(txt) {
          return "<a class='external' target='" + (msg.target || "_blank") + 
                 "' href='" + htmlEscape(msg.url) + "'>" +
                    txt + "</a>";
        };
      }
      else if (msg.link) {
        linkFun = msg.link;
      }


      
      if (msg.message) 
        txt = msg.message;
      else
        txt = msg.toString();
    }
    else if (msg) {
      txt = msg.toString();
    }

    txt = capitalize(txt);

    if (!kind) kind = Msg.Normal;
    console.log("madoko: " + (kind !== Msg.Normal ? kind + ": " : "") + txt);

    if (kind !== Msg.Trace && consoleOut) {
    
      function span(n) {
        var xtxt = txt;
        if (n) {
          xtxt = xtxt.replace(/^\s*(.*)[\s\S]*/,"$1"); // just the first line
          if (xtxt.length > n-2) {
            xtxt = xtxt.substr(0,n) + "...";
          }
        }
        var content = spanLines(htmlEscape(xtxt),"msg-line");
        return "<span class='msg-" + kind + "'>" + (linkFun ? linkFun(content) : content)  + "</span>";
      }

      var prefix  = "<div class=\"msg-section\">";

      var current = consoleOut.innerHTML;
      if (current.length > 1.25*maxConsole) {
        var rx = new RegExp(prefix,"gi");
        rx.lastIndex = maxConsole;
        var cap = rx.exec(current);
        if (cap) {
          current = current.substr(0,cap.index);
        }
      }

      var date = new Date();
      var dprefix = "<span class='msg-time'>(" + lpad(date.getHours().toString(),2,"0") + ":" + lpad(date.getMinutes().toString(),2,"0") + ":" + lpad(date.getSeconds().toString(),2,"0") + ") </span>"
      
      consoleOut.innerHTML = prefix + dprefix + span() + "</span></div>" + current;
      
      if (kind===Msg.Warning || kind===Msg.Error || kind===Msg.Exn) {
        setStatusHTML(span(60));
      }
      else if (kind===Msg.Status) {
        setStatusHTML(span(60))
      }
    }
  }

  function assert( pred, msg ) {
    if (!pred) {
      console.log("assertion failed: " + msg);
    }
  }

  // Get the properties of an object.
  function properties(obj) {
    var attrs = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        attrs.push(key);
      }
    } 
    return attrs;
  }

  function forEachProperty( obj, action ) {
    properties(obj).forEach( function(key) {
      return action(key,obj[key]);
    });
  }

  // extend target with all fields of obj.
  function extend(target, obj) {
    properties(obj).forEach( function(prop) {
      target[prop] = obj[prop];
    });
  }

  function copy(src ) {
    return clone(src,false);
  }

  function clone(src, deep, _visited) 
  {
    deep = (deep===undefined ? true : deep);

    if (src==null || typeof(src)!=="object") {
      return src;
    }
    if (deep) {
      if (typeof _visited===undefined) {
        _visited = [];
      }
      else {
        var i,len = _visited.length;
        for(i=0; i<len; i++) {
          if (_visited[i]===src) return src;
        }
      }
      _visited.push(src);
    }

    if (typeof src.clone === "function") {
      return src.clone(true);
    }
    else if (src instanceof Date){
      return new Date(src.getTime());
    }
    else if(src instanceof RegExp){
      return new RegExp(src);
    }
    else if(src.nodeType && typeof src.cloneNode == 'function'){
      return src.cloneNode(true);
    }
    else {
      var proto = (Object.getPrototypeOf ? Object.getPrototypeOf(src): src.__proto__);
      if (!proto) {
        proto = src.constructor.prototype;
      }
      var dest = Object.create(proto);
      for(var key in src){
        dest[key] = (deep ? clone(src[key],true,_visited) : src[key]);
      }
      return dest;
    }
  }


  var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
  };

  function dateFromISO(s) {
    function parseNum(n) {
      var i = parseInt(n,10);
      return (isNaN(i) ? undefined : i);
    }

    var rxISO = /^(\d\d\d\d)\-?(\d\d)\-?(\d\d)(?:T(\d\d):?(\d\d)(?:[:]?(\d\d))?(?:Z|([\+\-])(\d\d)(?:[:]?(\d\d))?)?)?$/i;
    var cap = rxISO.exec( s.replace(/\s+/g, "") );
    if (!cap) return new Date(0);    
    var utc  = new Date( Date.UTC( parseNum(cap[1]), parseNum(cap[2])-1, parseNum(cap[3]),
                                   parseNum(cap[4]), parseNum(cap[5]), parseNum(cap[6]) ) );
    if (!utc || isNaN(utc)) return new Date(0);
    var tz = (cap[9]=="+" ? -1 : 0) * ((parseNum(cap[8])||0) * 60 + (parseNum(cap[9])||0));
    if (tz !== 0) utc.setUTCMinutes( utc.getUTCMinutes + tz );
    return utc;
  }

  function replicate(s,n) {
    var acc = "";
    for(var i = 0; i < n; i++) {
      acc += s;
    }
    return acc;
  }

  function lpad(s,n,c) {
    if (!c) c = "0";
    if (!s) s = "";
    if (!n) return s;
    if (s.length >= n) return s;
    return (replicate(c,n - s.length) + s);
  }

  function contains( xs, s ) {
    if (!xs) return false;
    if (!s) return true;
    if (xs instanceof Array) {
      for(var i = 0; i < xs.length; i++) {
        if (xs[i] === s) return true;
      }
    }
    else if (typeof xs === "string") {
      if (xs.indexOf(s) >= 0) return true;
    }
    return false;
  }

  function hasClassName( elem, cname ) {    
    if (!elem || elem.className==null) return false;
    var names = elem.className.split(/\s+/);
    return contains(names,cname);
  }

  function toggleClassName( elem, cname ) {
    if (hasClassName(elem,cname)) {
      removeClassName(elem,cname);
    }
    else {
      addClassName(elem,cname);
    }
  }

  function removeClassName( elem, cname ) {
    if (!elem || elem.className==null) return;
    var cnames = elem.className;
    var names = cnames.split(/\s+/);
    var newnames = names.filter( function(n) { return (n !== cname); });
    if (names.length !== newnames.length) {
      elem.className = newnames.join(" ");
    }
  }

  function addClassName( elem, cname ) {
    if (!elem || elem.className==null) return;
    var cnames = elem.className;
    var names = cnames.split(/\s+/);
    if (!contains(names,cname)) {
      elem.className = cnames + " " + cname;
    }    
  }

  function startsWith(s,pre) {
    if (!pre) return true;
    if (!s) return false;
    return (s.substr(0,pre.length).indexOf(pre) === 0);
  }

  function endsWith(s,post) {
    if (!post) return true;
    if (!s) return false;
    var i = s.indexOf(post);
    return (i >= 0 && (s.length - post.length) == i);
  }

  // no ".", "..", ":", or starting with "/"
  function isRelative(fname) {
    return (/^(?![\.\/])([\w\-]|\.\w|\/\w)+$/.test(fname));
  }

  function firstdirname(path) {
    var dir = Stdpath.dirname(path);
    if (!dir) return "";
    return dir.replace(/[\/\\].*$/, "");
  }


  var mimeTypes = {    
    mdk: "text/madoko",
    md: "text/markdown",
    mkdn: "text/markdown",
    markdown: "text/markdown",

    txt: "text/plain",
    css: "text/css",
    html:"text/html",
    htm: "text/html",
    xml: "text/html",
    js:  "text/javascript",
    pdf: "application/pdf",
    json:"application/json",
    
    tex: "text/tex",
    sty: "text/tex",
    cls: "text/tex",
    bib: "text/plain",
    bbl: "text/tex",
    aux: "text/tex",
    dimx: "text/plain",
    log: "text/plain",

    png:  "image/png",
    jpg:  "image/jpg",
    jpeg: "image/jpg",
    gif:  "image/gif",
    svg:  "image/svg+xml",
    eps:  "image/eps",
  };

  function mimeFromExt( fname ) {
    var ext = Stdpath.extname(fname);
    if (ext) {
      var mime = mimeTypes[ext.substr(1)];
      if (mime) return mime;
    }
    return "text/plain";
  }


  function hasImageExt(fname) {
    return startsWith(mimeFromExt(fname),"image/");
  }

  function hasTextExt(fname) {
    return startsWith(mimeFromExt(fname),"text/");
  }

  var embedExts = [".bbl",".js",".css",".json",".mdk",".cls",".bib"].join(";");
  function hasEmbedExt(fname) {
    var ext = Stdpath.extname(fname);
    if (!ext) return false;
    return (contains(embedExts,ext));
  }


  var dropExts = [".js",".css","mdk","md","bib","cls","sty","tex","png","jpg","jpeg","gif","svg","eps"].join(";");
  function hasDropExt(fname) {
    var ext = Stdpath.extname(fname);
    if (!ext) return false;
    return (contains(dropExts,ext));
  }

  function isTextMime( mime ) {
    return (startsWith(mime,"text/") || mime==="application/json");
  }
  
  var generatedExts = [".bbl",".dimx",".aux",".dvi",".pdf",".html",".log"].join(";");
  function hasGeneratedExt(fname) {
    var ext = Stdpath.extname(fname);
    if (!ext) return false;
    return (contains(generatedExts,ext) || endsWith(fname,".final.tex") || Stdpath.dirname(fname)==="out");
  }

  function toggleButton( elemName, text0, text1, action ) {
    var button = (typeof elemName === "string" ? document.getElementById(elemName) : elemName);
    var toggled = true;
    function toggle() {
      toggled = !toggled;
      if (text0) button.innerHTML = (toggled ? text1 : text0);
    }
    toggle();
    button.onclick = function(ev) {
      toggle();
      action(ev,toggled);
    }
  }


  function decodeBase64Code(c) 
  {
    if (c > 64 && c < 91) return (c - 65);
    else if (c > 96 && c < 123) return (c - 71);
    else if (c > 47 && c < 58)  return (c + 4);
    else if (c===43) return 62;
    else if (c===47) return 63;
    else return 0;
  }

  // convert base64 string to uint8array.
  function decodeBase64( content ) {
    var src = content.replace(/[^A-Za-z0-9\+\/]/g,""); // keep only relevant characters
    var len = src.length; 
    var destlen = (len>>2)*3 + (len&3);
    var dest = new Uint8Array(destlen);

    var acc = 0;
    var desti = 0;
    for( var i = 0; i < len; i++) {
      // accumulate four 6-bit values
      acc |= decodeBase64Code(src.charCodeAt(i)) << (18 - 6 * (i&3));
      if ((i&3) === 3 || i === len-1) {
        // write out accumulator to three 8-bit values
        for(var j = 0; j < 3 && desti < destlen; j++) {
          dest[desti] = (acc >>> ((2-j)*8)) & 255;
          desti++;
        }
        acc = 0; // reset accumulator
      }      
    }
    return dest;
  }

  // convert arraybuffer to base64 string
  function encodeBase64( buffer ) {
    var binary = ""
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] )
    }
    return window.btoa( binary );
  }  

  function px(s) {
    if (typeof s === "number") return s;
    var cap = /^(\d+(?:\.\d+)?)(em|ex|pt|px|pc|in|mm|cm)?$/.exec(s);
    if (!cap) return 0;
    var i = parseInt(cap[1]);
    if (isNaN(i)) return 0;
    if (cap[2] && cap[2] !== "px") {
      var dpi = 96;
      var empx = 12;
      if (cap[2]==="em") {
        i = (i * empx);
      }
      else if (cap[2]==="ex") {
        i = (i * empx * 0.5);
      }
      else if (cap[2]==="pt") {
        i = (i/72) * dpi;
      }
      else if (cap[2]==="pc") {
        i = (i/6) * dpi;
      }
      else if (cap[2]==="in") {
        i = i * dpi;
      }
      else if (cap[2]==="mm") {
        i = (i/25.6) * dpi;
      }
      else if (cap[2]==="cm") {
        i = (i/2.56) * dpi;
      }
    }
    return i;
  }

  function asyncForEach( xs, asyncAction, cont ) {
    if (!xs || xs.length===0) return cont(0,[]);
    var count = xs.length;
    var objs  = [];
    var err   = null;
    xs.forEach( function(x) {
      function localCont(xerr,obj) {
        objs.push(obj);
        if (xerr) err = xerr;
        count--;
        if (count <= 0) cont(err,objs);
      }
      try {
        asyncAction(x, localCont );
      }
      catch(exn) {
        localCont(exn);
      }
    });
  }

  function dispatchEvent( elem, eventName ) {
    var event;
    // we should use "new Event(eventName)" for HTML5 but how to detect that?
    if (document.createEvent) {
        event = document.createEvent('HTMLEvents');
        event.initEvent(eventName,true,true);
    }
    else if (document.createEventObject) { // IE < 9
        event = document.createEventObject();
        event.eventType = eventName;
    }
    event.eventName = eventName;
    if (elem.dispatchEvent) {
        elem.dispatchEvent(event);
    }
    else if (elem.fireEvent) { 
        elem.fireEvent('on' + eventName, event);
    }
    else if (elem[eventName]) {
        elem[eventName]();
    } 
    else if (elem['on' + eventName]) {
        elem['on' + eventName]();
    }
  }

  function getCookie(name) {
    var rx = RegExp("\\b" + name + "=([^;&]*)");
    var cap = rx.exec(document.cookie);
    return (cap ? decodeURIComponent(cap[1]) : null);
  }

  function setCookie( name, value, opts ) {
    if (!opts) opts = {};
    if (typeof opts === "number") opts = { maxAge: opts };
    if (!opts.expires) opts.expires = (opts.maxAge ? new Date( Date.now() + opts.maxAge * 1000 ) : new Date(0));
    else if (typeof opts.expires !== "object") opts.expires = new Date(opts.expires);

    var cookie = name + "=" + encodeURIComponent(value);
    cookie += ";path=" + (opts.path || "/");
    if (opts.secure!==false) cookie += ";secure";
    //if (opts.httpOnly) cookie += ";httpOnly";
    cookie += ";expires=" + opts.expires.toGMTString();    
    document.cookie = cookie;
  }



  function getScrollTop( elem ) {
    if (!elem) return 0;
    if (elem.contentWindow) {
      // iframe
      if (elem.contentWindow.pageYOffset) return elem.contentWindow.pageYOffset;
      var doc = elem.contentDocument;
      if (!doc) return 0;
      return (doc.documentElement || doc.body.parentNode || doc.body).scrollTop;
    }
    else if (elem.pageYOffset) {
      return elem.pageYOffset;
    }
    else {
      return elem.scrollTop;
    }
  }

  function setScrollTop( elem, top ) {
    if (!elem) return;
    if (elem.contentWindow) {
      elem = elem.contentWindow;
    }
    if (elem.scroll) {
      elem.scroll( elem.pageXOffset || 0, top );
    }
    else {
      elem.scrollTop = top;
    }
  }

  function animateScrollTop( elem, top, duration, steps ) {
    var top0 = getScrollTop(elem);
    if (top0 === top) return;
    if (duration <= 50 || Math.abs(top - top0) <= 10) {
      duration = 1;
      steps = 1;
    }

    var n = 0;
    var action = function() {
      n++;
      var top1 = top;
      if (n >= steps) {
        if (elem.animate) {
          clearInterval(elem.animate);
          delete elem.animate;
        }
      }
      else {
        top1 = top0 + ((top - top0) * (n/steps));
      }
      setScrollTop(elem,top1);
    };

    var ival = (steps && steps > 0 ? duration / steps : 50);
    steps = (duration / ival) | 0;
    
    action();    
    if (steps > 1) {
      if (elem.animate) {
        clearInterval(elem.animate);
      }    
      elem.animate = setInterval( action, ival);    
    }
  }

  function animate( elem, props, duration, steps ) {
    var ival = (steps ? duration / steps : 50);
    steps = (duration / ival) | 0;
    if (steps <= 0) steps = 1;
    var elem0 = {};
    properties(props).forEach( function(prop) {
      elem0[prop] = elem[prop];
    });
    var n = 0;
    if (elem.animate) {
      clearInterval(elem.animate);
    }
    var action = function() {
      n++;
      if (n >= steps) {
        clearInterval(elem.animate);
        elem.animate = undefined;
        properties(props).forEach(function(prop) {
          elem[prop] = props[prop];
        });
      }
      else {
        properties(props).forEach(function(prop) {
          var x = elem0[prop] + ((props[prop] - elem0[prop]) * (n/steps));
          elem[prop] = x;
        });
      }
    };

    elem.animate = setInterval( action, ival);
    action(); // perform one step right away
  }
  
  var ContWorker = (function() {
    function ContWorker( scriptName ) {
      var self = this;
      self.promises = {};
      self.unique = 1;
      
      // collect message while the worker starts up
      self.scriptName = scriptName;
      self.postqueue = []; 
      self.restart();

      // check heartbeat
      self.lastBeat;
      setInterval( function() {
        if (self.lastBeat - self.heartbeat > 45000) {
           self.restart(); 
        }
        self.lastBeat = Date.now();
      }, 15000 );
    }

    ContWorker.prototype.restart = function() {
      var self = this;

      if (self.worker) {
        message( "restarting worker", Msg.Info );
        self.worker.terminate();        
        for (var key in self.promises) {
          if (self.promises.hasOwnProperty(key)) {
            self._onComplete( { messageId: key, timedOut: true } );            
          }
        }
      }
      self.unique = 1;
      self.ready = false;
      self.worker = new Worker( self.scriptName );
      self.worker.addEventListener("message", function(ev) {
        var res = ev.data;
        self._onComplete(res);
      });
      
      self.heartbeat = Date.now();      
    }

    ContWorker.prototype._onHeartBeat = function( _heartbeat ) {
      var self = this;
      self.heartbeat = Date.now();
    }

    ContWorker.prototype._isReady = function() {
      return self.ready;
    }

    ContWorker.prototype.postMessage = function( info, timeout ) {
      var self = this;
      var promise = new Promise();
      if (!self.ready) {
        self.postqueue.push( { info: info, promise: promise, timeout: timeout });
      }
      else {
        var id = self.unique++;
        info.messageId = id; 
        var timeoutId = 0;
        if (timeout && timeout > 1) {
          timeoutId = setTimeout( function() { 
            self._onComplete( { messageId: id, timedOut: true } );            
          }, timeout);
        }
        self.promises[id] = { promise: promise, timeoutId: timeoutId };
        self.worker.postMessage( info );        
      }
      return promise;
    }

    ContWorker.prototype._onComplete = function( info ) {
      var self = this;
      if (!info || typeof info.messageId === "undefined") return;
      if (info.heartbeat) {
        self._onHeartBeat( info.heartbeat );
      }
      else if (info.messageId === 0) {
        self.ready = true;
        self.postqueue.forEach( function(elem) {  // post delayed messages
          self.postMessage( elem.info, elem.timeout ).then(elem.promise);
        });
      }
      else {
        var promise = self.promises[info.messageId];
        delete self.promises[info.messageId];
        if (!promise) return;
        if (promise.timeoutId) clearTimeout(promise.timeoutId);
        promise.promise.resolve(info);
      }
    }

    return ContWorker;
  })();


  var AsyncRunner = (function() {
    function AsyncRunner( refreshRate, spinner, isStale, action ) {
      var self = this;
      self.spinner = spinner;
      self.isStale = isStale;
      self.action = action;
      self.ival = 0;
      self.round = 0;
      self.lastRound = 0;
      self.stale = false;
      self.refreshRate = refreshRate || 1000;
      
      self.dynamicRefreshRate = false;
      self.minRefreshRate = 100;
      self.maxRefreshRate = 1000;
      
      self.times = [self.refreshRate];
      self.timesSamples = 10;      
      self.resume(self.refreshRate);
    }
    
    AsyncRunner.prototype.resume = function(refreshRate) {
      var self = this;
      if (self.ival) {
        self.pause();
      }
      self.refreshRate = refreshRate || self.refreshRate;
      message("adjust refresh rate: " + self.refreshRate.toFixed(0) + "ms", Msg.Info);
      self.ival = setInterval( function(){ self.update(); }, self.refreshRate );
    }

    AsyncRunner.prototype.pause = function() {
      var self = this;
      if (self.ival) {
        clearInterval(self.ival);
        self.ival = 0;
      }
    }

    AsyncRunner.prototype.setStale = function() {
      var self = this;
      self.stale = true;
      self.run();
    }

    AsyncRunner.prototype.clearStale = function() {
      var self = this;
      self.stale = false;
    }

    AsyncRunner.prototype.update = function() {
      var self = this;
      if (!self.stale && self.isStale) {
        self.stale = self.isStale();
      }
      self.run();
    }

    AsyncRunner.prototype.run = function(force) {
      var self = this;
      if ((force || self.stale) && self.round <= self.lastRound) {
        self.stale = false;
        self.round++;
        var round = self.round;
        if (self.spinner) self.spinner(true);
        var time0 = Date.now();
        return self.action( self.round ).then( function(msg) {
            var time = Date.now() - time0;
            self.times.push( time );
            if (self.times.length > self.timesSamples) self.times.shift();
            var avg = self.times.reduce( function(prev,t) { return prev+t; }, 0 ) / self.times.length;
            message( (msg ? msg + "\n" : "") + 
              "  avg full: " + avg.toFixed(0) + "ms, this: " + time.toFixed(0) + "ms" +
              "  run rate: " + self.refreshRate.toFixed(0) + "ms", 
              Msg.Prof);
            
            if (self.dynamicRefreshRate) {
              if (avg > 0.66 * self.refreshRate && self.refreshRate < self.maxRefreshRate) {
                self.resume( Math.min( self.maxRefreshRate, 1.5 * self.refreshRate ) );
              }
              else if (avg < 0.33*self.refreshRate && self.refreshRate > self.minRefreshRate) {
                self.resume( Math.max( self.minRefreshRate, 0.66 * self.refreshRate ) );
              }
            }
          },
          function(err) {
            message( err, Msg.Exn );  
          }
          ).always( function() {
            if (self.lastRound < round) {
              self.lastRound = round;          
              if (self.spinner) self.spinner(false);
            }
          });
      }
      else {
        return Promise.resolved();
      }
    }

    return AsyncRunner;
  })();

  function urlParamsDecode(hash) {
    if (!hash) return {};
    if (hash[0]==="#" || hash[0]==="?") hash = hash.substr(1);
    var obj = {};
    hash.split("&").forEach( function(part) {
      var i = part.indexOf("=");
      var key = decodeURIComponent(i < 0 ? part : part.substr(0,i));
      var val = decodeURIComponent(i < 0 ? "" : part.substr(i+1));
      obj[key] = val;
    });
    return obj;
  }

  function urlParamsEncode( obj ) {
    if (!obj || typeof(obj)==="string") return obj;
    var vals = [];
    properties(obj).forEach( function(prop) {
      vals.push( encodeURIComponent(prop) + "=" + encodeURIComponent( obj[prop] != null ? obj[prop].toString() : "") );
    });
    return vals.join("&");
  }

  function requestGET( opts, params ) {
    var reqparam = (typeof opts === "string" ? { url: opts } : opts);
    if (!reqparam.method) reqparam.method = "GET";
    reqparam.contentType = null; //"application/x-www-form-urlencoded";     
    return requestXHR( reqparam, params, null );
  }
  
  function requestPUT( opts, params, body ) {
    var reqparam = (typeof opts === "string" ? { url: opts } : opts);
    if (!reqparam.method) reqparam.method = "PUT";
    return requestXHR( reqparam, params, body );
  }

  function requestPOST( opts, params, body ) {
    var reqparam = (typeof opts === "string" ? { url: opts } : opts);
    if (!reqparam.method) reqparam.method = "POST";
    return requestXHR( reqparam, params, body ); 
  }

  // clean up request cache every 1 minute
  var requestCache = new Map();
  setInterval( function() {
    var now = Date.now();
    requestCache.forEach( function(url,cached) {
      if (cached.lastUpdate + cached.removeIval < now) {
        requestCache.remove(url);
      }
    });
  }, 60000 );

  function requestXHR( opts, params, body ) {
    var reqparam = (typeof opts === "string" ? { url: opts } : opts);    
    var req = new XMLHttpRequest();
    var method = reqparam.method || "GET";
    if (method !== "GET") reqparam.cache = null;
   
    // init headers
    var headers = reqparam.headers || {};
    if (reqparam.access_token) {
      if (!startsWith(reqparam.url,"https://")) {
        throw new Error("Attempt to pass access_token to non-secure site: " + reqparam.url);
      }
      headers.Authorization = "Bearer " + reqparam.access_token;
    }

    // init query
    if (!params) params = {};
    if (reqparam.nocache) params.nocache = randomHash8();
    var query = urlParamsEncode(params);
    if (query) reqparam.url = reqparam.url + "?" + query;

    // Check cache
    var cached = null;
    if (reqparam.cache) {
      cached = requestCache.get(reqparam.url);
      if (cached && cached.lastUpdate + cached.retryIval > Date.now()) {
        return Promise.resolved(cached.value);  // cached, no need to issue a request
      }
    }

    // Open request
    req.open( method, reqparam.url, true );
    
    var timeout = 0;  // timeout handler id.
    var promise = new Promise();

    function reject(message,httpCode) {
      try {
        if (timeout) clearTimeout(timeout);
        
        if (cached) {  // we retried, but failed: return the previous cached value
          cached.lastUpdate = Date.now();
          return promise.resolve(cached.value);
        }

        // otherwise, construct an error reply
        var domain = reqparam.url.replace( /^([^\?\#]+).*$/, "$1" );
        var msg    = (req.statusText || ("network request failed (" + domain + ")")) + (message ? ": " + message : "");
        var type = req.getResponseHeader("Content-Type") || req.responseType;
        if ((startsWith(type,"application/json") || startsWith(type,"text/javascript")) && req.responseText) {
          var res = JSON.parse(req.responseText);
          if (res.error && res.error.message) {
            msg = msg + ": " + res.error.message + (res.error.code ? "(" + res.error.code + ")" : "");
          }
          else if (res.error && typeof res.error === "string") {
            msg = msg + ": " + res.error;
          }      
          else if (res.message) {
            msg = msg + ": " + res.message;
          }
        }
        else if (startsWith(type,"text/") && req.responseText) {
          msg = msg + ": " + req.responseText;
        }
        
        //cont(msg, res, req.response);
        console.log(msg + "\n request: " + method + ": " + reqparam.url );
        promise.reject( { message: msg, httpCode: httpCode || req.status || 400 } );
      }
      catch(exn) {
        promise.reject( { message: exn.toString(), httpCode: httpCode || 400 } );
      }
    }

    req.onload = function(ev) {
      if (req.readyState === 4 && req.status >= 200 && req.status <= 299) {
        if (timeout) clearTimeout(timeout);
        // parse result
        var type = req.getResponseHeader("Content-Type") || req.responseType;
        var res;
        if (startsWith(type,"application/json") || startsWith(type,"text/javascript")) {
          res = JSON.parse(req.responseText);
        }
        else {
          res = req.response;
        }
        // update cache?
        if (reqparam.cache) {
          if (reqparam.cache === true) reqparam.cache = 30 * 60 * 1000; // 30 minutes
          cached = requestCache.getOrCreate(reqparam.url, { });
          cached.removeIval = (reqparam.cache < 0 ? 60*60*1000 : reqparam.cache);
          cached.retryIval  = (reqparam.cache < 0 ? - reqparam.cache : cached.removeIval);
          cached.lastUpdate = Date.now();
          cached.value = res;
        }
        promise.resolve(res,req);
      }
      else {
        reject();
      }
    }
    req.reject = function(ev) {
      reject();
    }
    req.onerror = function(ev) {
      reject();
    }
    req.ontimeout = function(ev) {
      reject("request timed out", 408);
    }
    if (reqparam.timeout != null) req.timeout = reqparam.timeout;
    
    
    // Encode content
    var contentType = "text/plain";
    var content = null;

    if (body) {
      if (typeof body === "string") {
        contentType = "text/plain";
        content = body;
      } 
      // object: use url-encoded for GET and json for POST/PUT      
      //else if (reqparam.method==="GET") {
      //  contentType = "application/x-www-form-urlencoded";
      //  content = urlEncode(params);
      //}
      // array
      else if (body instanceof Uint8Array) {
        contentType = "application/octet-stream";
        content = body;
      }
      // json
      else {
        contentType = "application/json";
        content = JSON.stringify(body);
      }      
    }
    // override content type?
    if (reqparam.contentType !== undefined) {
      contentType = reqparam.contentType;
    }

    if (reqparam.responseType == null && reqparam.binary) {
      reqparam.responseType = "arraybuffer";
    }

    // override response type?
    if (reqparam.responseType != null) {
      req.overrideMimeType(reqparam.responseType);
      req.responseType = reqparam.responseType;
    }

    // override mime type
    if (reqparam.mimeType != null) {
      req.overrideMimeType(reqparam.mimeType);
    }

    // set headers
    properties(headers).forEach( function(hdr) {
      req.setRequestHeader(hdr, headers[hdr]);
    });

    if (contentType) req.setRequestHeader("Content-Type", contentType);    
    req.send(content);
    return promise;
  }

  function downloadText(fname,text) {
    w = window.open();
    doc = w.document;
    doc.open( 'text/html','replace');
    doc.charset = "utf-8";
    doc.write(text);
    doc.close();
    w.scrollTo(0,0);
    //doc.execCommand("SaveAs", null, fname)
  }

  function downloadFile(url) 
  {
    var w = window.open(url, "_newtab", "");    
    if (w) w.focus();
  }
    //var frame = document.getElementById("download-frame");
    //frame.src = url + "?download";
  /*
    var userAgent = navigator.userAgent.toLowerCase();
    //If in Chrome or Safari - download via virtual link click
    if ((contains(userAgent,"chrome") || contains(userAgent,"safari")) && document.createEvent) {
      var link = document.createElement('a');
      link.href = url;

      if (link.download !== undefined){
        //Set HTML5 download attribute. This will prevent file from opening if supported.
        link.download = Stdpath.basename(url);
      }

      var ev = document.createEvent('MouseEvents');
      ev.initEvent('click' ,true ,true);
      link.dispatchEvent(ev);
      //link.click();
    }
    else {
      window.open(url + "?download");
    }
  }
*/
  /*
w = window.open();
doc = w.document;
doc.open( mimetype,'replace');
doc.charset = "utf-8";
doc.write(data);
doc.close();
doc.execCommand("SaveAs", null, filename)
*/

  function _openWindow(opts, params ) {
    var query = (params ? urlParamsEncode(params) : "");
    if (query) opts.url = opts.url + "?" + query;

    if (opts.width==null || opts.width < 0) opts.width = 600;
    if (opts.height==null || opts.height < 0) opts.height = 500; 

    if (opts.width < 1) opts.width = window.outerWidth * opts.width;
    if (opts.height < 1) opts.height = window.outerHeight * opts.height;

    if (opts.left==null) opts.left = (window.screenX || window.screenLeft) + ((window.outerWidth - opts.width) / 2);
    if (opts.top==null)  opts.top  = (window.screenY || window.screenTop) + (((window.outerHeight - opts.height) / 2) - 30);

    var features = [
      "width=" + opts.width.toFixed(0),
      "height=" + opts.height.toFixed(0),
      "top=" + opts.top.toFixed(0),
      "left=" + opts.left.toFixed(0),
      "status=no",
      "resizable=yes",
      "toolbar=no",
      "menubar=no",
      "scrollbars=yes"];

    var popup = window.open(opts.url, opts.name || "oauth", features.join(","));
    if (popup && (opts.focus !== false)) {
      popup.focus();
    }

    return popup;
  }

  function openModalPopup( opts, params ) {
    if (typeof opts==="string") opts = { url: opts };
    var w = _openWindow( opts, params );
    if (!w) return Promise.rejected( new Error("popup was blocked") );
    if (opts.timeout && opts.timeout > 0) {
      setTimeout( function() { 
        w.close(); 
      }, opts.timeout );
    }
    return new Promise( function(cont) {
      var timer = setInterval(function() {   
        if(w==null || w.closed) {  
          clearInterval(timer);  
          cont(null);
        }  
      }, 100); 
    });
  }


  function getScreenOffset(elem) {
    var box = elem.getBoundingClientRect()
    
    var body = document.body
    var docElem = document.documentElement
    
    var scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop
    var scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft
    
    var clientTop = docElem.clientTop || body.clientTop || 0
    var clientLeft = docElem.clientLeft || body.clientLeft || 0
    
    var top  = box.top +  scrollTop - clientTop
    var left = box.left + scrollLeft - clientLeft
    
    return { top: Math.round(top), left: Math.round(left) }
  } 

  function getDocumentOffset(elem) {
    var top = 0;
    var left = 0;
    while( elem ) {
      top = top + elem.offsetTop;
      left = left + elem.offsetLeft;
      elem = elem.offsetParent;
    }
    return { top: top, left: left };
  }

  function enablePinned() 
  {
    var pinned = null;
    var offsetX = 0;
    var offsetY = 0;

    function moveStart(_pinned,ev) {
      moveEnd();
      pinned  = _pinned;
      var src = pinned.getBoundingClientRect();
      var doc = getDocumentOffset(pinned.parentNode);
      offsetX = ev.clientX - src.left + doc.left;
      offsetY = ev.clientY - src.top + doc.top;      
      addClassName(pinned,"moving");
      addClassName(pinned,"pinned");
      window.addEventListener( "mousemove", mouseMove, true );
    }

    function moveEnd(ev) {
      if (pinned) {        
        window.removeEventListener( "mousemove", mouseMove, true );
        removeClassName(pinned,"moving");
        pinned = null;
        offsetX = 0;
        offsetY = 0;
      }
    };

    function mouseMove(ev) {
      if (pinned) {
        ev.stopPropagation();
        ev.preventDefault();
        pinned.style.top = (ev.clientY - offsetY).toFixed(0) + "px";
        pinned.style.left = (ev.clientX - offsetX).toFixed(0) + "px";
      }
    }

    window.addEventListener("mouseup", moveEnd );    

    [].forEach.call( document.getElementsByClassName("pinnable"), function(menu) {
      var pinbox = document.createElement("DIV");
      pinbox.className = "pinbox";
      var imgPin = document.createElement("IMG");
      imgPin.src = "images/icon-pin.png";
      imgPin.title = "Pin this menu";
      imgPin.className = "pin button";
      pinbox.appendChild(imgPin);
      var imgUnpin = document.createElement("IMG");
      imgUnpin.src = "images/icon-unpin.png";
      imgUnpin.title = "Unpin this menu";
      imgUnpin.className = "unpin button";
      pinbox.appendChild(imgUnpin);
      menu.insertBefore(pinbox,menu.firstChild);
      var left = menu.style.left;
      var top  = menu.style.top;
      imgUnpin.addEventListener( "click", function(ev) {
        menu.style.left = left;
        menu.style.top = top;
        removeClassName(menu, "pinned");
      });
      imgPin.addEventListener("click", function(ev) {
        if (!hasClassName(menu,"pinned")) {
          moveStart(menu,ev);
        }
      });
    });

  }



  function enablePopupClickHovering() 
  {
    var hovering = null;

    document.body.addEventListener("click", function(ev) {
      if (hovering) {
        removeClassName(hovering,"hover");
        hovering = null;
      }
    });
    
    function isDivParent(parent,elem) {
      while( elem && elem !== parent && elem.nodeName !== "DIV") {
        elem = elem.parentNode;
      }
      return (elem === parent);
    }

    var hoverElems = document.getElementsByClassName("popup");
    for(var i = 0; i < hoverElems.length; i++) {
      var elem = hoverElems[i];
      elem.addEventListener( "click", function(ev) {
        if (hovering) {
          removeClassName(hovering, "hover");
        }
        var thisElem = isDivParent(ev.currentTarget,ev.target);
        if ((hovering && hovering !== ev.currentTarget) ||
            (hovering && !thisElem && hasClassName(ev.currentTarget,"no-close-on-click")) ||
            (!hovering && thisElem)) {          
          hovering = ev.currentTarget;
          addClassName(hovering,"hover");
          ev.stopPropagation(); // or the body listener cancels again..                         
        }
        else {
          hovering = null;
        }
      });
    }
  }

  function withOAuthState(remote, action) {
    var state = Date.now().toFixed(0) + "-" + (Math.random() * 99999999).toFixed(0);
    var key   = "oauth/state";
    setCookie(key,JSON.stringify({ remote: remote, state: state}),{maxAge: 30, httpOnly: true, secure: true});
    return action(state).always( function() {
      setCookie(key,"",{maxAge: 0});
    });
  }

  function openOAuthLogin( remote, opts, params ) {
    return withOAuthState( remote, function(state) {
      params.state = state;
      return openModalPopup(opts,params); 
    });
  }

  function openOAuthLogout( remote, opts, params ) {
    if (opts.timeout==null) {
      opts.timeout = 500;
    }
    opts.focus = false;
    return openModalPopup(opts,params); 
  }

  function getSessionObject(name) {
    if (!sessionStorage || !name) return null;
    var value = sessionStorage.getItem(name);
    return (value != null ? JSON.parse(value) : null);
  }

  function setSessionObject(name,value) {
    if (!sessionStorage || !name) return;
    if (value == null) {
      sessionStorage.removeItem(name);
    }
    else {
      sessionStorage.setItem(name,JSON.stringify(value));
    }
  }

  function removeSessionObject(name) {
    setSessionObject(name,null);
  }

  function randomHash8() {
    return (Math.random()*99999999).toFixed(0);
  }

  function getAppVersionInfo(latest) {
    return requestGET({url:"version.json", timeout:2500, nocache:latest}).then( function(info) {
      return info;
    }, function(err) {
      return null;
    });
  }

  return {
    properties: properties,
    forEachProperty: forEachProperty,
    extend: extend,
    copy: copy,
    replicate: replicate,
    lpad: lpad,
    message: message,
    assert: assert,
    escape: htmlEscape,
    stringEscape: stringEscape,
    capitalize: capitalize,
    Msg: Msg,

    getSessionObject: getSessionObject,
    setSessionObject: setSessionObject,
    removeSessionObject: removeSessionObject,
    
    changeExt: Stdpath.changeExt,
    extname: Stdpath.extname,
    basename: Stdpath.basename,
    dirname: Stdpath.dirname,
    stemname: Stdpath.stemname,
    isRelative: isRelative,
    combine: Stdpath.combine,
    firstdirname: firstdirname,

    hasEmbedExt: hasEmbedExt,
    hasGeneratedExt: hasGeneratedExt,
    hasDropExt: hasDropExt,
    hasImageExt: hasImageExt,
    mimeFromExt: mimeFromExt,
    isTextMime: isTextMime,

    startsWith: startsWith,
    endsWith: endsWith,
    contains: contains,
    decodeBase64: decodeBase64,
    encodeBase64: encodeBase64,
    dateFromISO: dateFromISO,
    getCookie: getCookie,
    setCookie: setCookie,
    
    hasClassName: hasClassName,
    toggleClassName: toggleClassName,
    removeClassName: removeClassName,
    addClassName:addClassName,    
    toggleButton: toggleButton,
    px: px,
    animate: animate,
    dispatchEvent: dispatchEvent,
    asyncForEach: asyncForEach,

    getScrollTop: getScrollTop,
    setScrollTop: setScrollTop,
    animateScrollTop: animateScrollTop,

    requestPOST: requestPOST,
    requestPUT: requestPUT,
    requestGET: requestGET,
    requestXHR: requestXHR,
    downloadFile: downloadFile,
    downloadText: downloadText,
    //openAuthPopup: openAuthPopup,
    enablePopupClickHovering: enablePopupClickHovering,
    enablePinned: enablePinned,
    openModalPopup: openModalPopup,
    
    //withOAuthState: generateOAuthState,
    openOAuthLogin: openOAuthLogin,
    openOAuthLogout: openOAuthLogout,

    urlParamsEncode: urlParamsEncode,
    urlParamsDecode: urlParamsDecode,
  
    getAppVersionInfo: getAppVersionInfo,

    ContWorker: ContWorker,
    AsyncRunner: AsyncRunner,
    Promise: Promise,
  };
}); 
