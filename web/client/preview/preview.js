/*---------------------------------------------------------------------------
  Copyright 2013 Microsoft Corporation.
 
  This is free software; you can redistribute it and/or modify it under the
  terms of the Apache License, Version 2.0. A copy of the License can be
  found in the file "license.txt" at the root of this distribution.
---------------------------------------------------------------------------*/

var Preview = (function() {

  // initialize
  var origin = window.location.origin || window.location.protocol + "//" + window.location.host;

  // Refresh message after some seconds
  setTimeout(function() {
    var p = document.getElementById("preview-refresh");
    if (p) {
      p.className = p.className.replace(/\bpreview-hidden\b/g,"");
    }
  }, 7500);


  
  /*-------------------------------------------------------
     On double click, navigate to correct line
  -------------------------------------------------------*/  
  function findLocation( root, elem ) {
    while (elem && elem !== root) {
      var dataline = (elem.getAttribute ? elem.getAttribute("data-line") : null);
      if (dataline) {
        cap = /(?:^|;)(?:([^:;]+):)?(\d+)$/.exec(dataline);
        if (cap) {
          var line = parseInt(cap[2]);
          if (line && line !== NaN) {
            return { path: cap[1], line: line };
          } 
        }
      }
      // search through previous siblings too since we include line span info inside inline element sequences.
      elem = (elem.previousSibling ? elem.previousSibling : elem.parentNode);
    }
    return null;
  }

  document.body.ondblclick = function(ev) {
    if (typeof(Reveal) !== "undefined" && /\bnavigate-/.test(ev.target.className) && /\bcontrols\b/.test(ev.target.parentNode.className)) return; // don't count double clicks on controls in presentations
    var res = findLocation(document.body,ev.target);
    if (res) {
      ev.preventDefault();
      res.eventType = 'previewSyncEditor';
      window.parent.postMessage( JSON.stringify(res), origin);
      console.log('posted: ' + JSON.stringify(res));
    }
  };


  /*-------------------------------------------------------
     Scrolling and offset calculations
  -------------------------------------------------------*/  
  function getDocumentOffset(elem) {
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


  function getScrollTop( elem ) {
    if (!elem) return 0;
    if (elem.contentWindow) {
      // iframe
      if (elem.contentWindow.pageYOffset) return elem.contentWindow.pageYOffset;
      var doc = elem.contentDocument;
      if (!doc) return 0;
      return (doc.documentElement || doc.body.parentNode || doc.body).scrollTop;
    }
    else if (typeof elem.pageYOffset !== "undefined") {
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
    if (duration <= 50 || Math.abs(top - top0) <= 2) {
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
      //console.log( "  scroll step " + n + " to " + top1 + ", " + top0 + ", " + steps);
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


  /*-------------------------------------------------------
     Scroll to right location based on a line number
  -------------------------------------------------------*/  

  function findNextElement(root,elem) {
    if (elem == null || elem === root) return elem;
    if (elem.nextSibling) return elem.nextSibling;
    return findNextElement(root,elem.parentNode);
  }

  function bodyFindElemAtLine( lineCount, line, fname ) {    
    var selector = "[data-line" + (fname ? '*=";' + fname + ':"' : "") + "]";
    var elems = document.querySelectorAll( selector );
    if (!elems) elems = [];

    var currentLine = line;
    var current = elems[0];
    var nextLine = line;
    var next = null;
    for(var i = 0; i < elems.length; i++) {
      var elem = elems[i];
      var dataline = elem.getAttribute("data-line");
      if (dataline) { // && child.style.display.indexOf("inline") < 0) {
        if (fname) {
          var idx = dataline.indexOf(fname + ":");
          dataline = (idx >= 0 ? dataline.substr(idx + fname.length + 1) : "" /* give NaN to parseInt */ );         
        } 
        var cline = parseInt(dataline);
        if (!isNaN(cline)) {
          if (cline <= line) {
            currentLine = cline;
            current = elems[i];
          }
          if (cline > line) {
            nextLine = cline;
            next = elems[i];
            break;
          }
        }
      }
    }

    if (!current) return null;
    if (!next) {
      next = findNextElement(document.body,current);
      nextLine = lineCount;
    }
    return { elem: current, elemLine : currentLine, next: next, nextLine: nextLine };
  }

  var lastScrollTop = -1;

  function scrollToLine( info )
  {
    var scrollTop = 0;
    if (info.sourceName || info.textLine > 1) {
      var res = bodyFindElemAtLine(info.lineCount, info.textLine, info.sourceName); // findElemAtLine( document.body, info.textLine, info.sourceName );
      if (!res) return false;
      if (typeof(Reveal)!=="undefined") return scrollToSlide(res);

      scrollTop = getDocumentOffset(res.elem).top; 
      //console.log("find elem at line: " + info.textLine + ":" ); console.log(info); console.log(res);
      
      // adjust for line delta: we only find the starting line of an
      // element, here we adjust for it assuming even distribution up to the next element
      if (res.elemLine < info.textLine && res.elemLine < res.nextLine) {
        var scrollTopNext = getDocumentOffset(res.next).top; 
        if (scrollTopNext > scrollTop) {
          var delta = (info.textLine - res.elemLine) / (res.nextLine - res.elemLine + 1);
          if (delta < 0) delta = 0;
          if (delta > 1) delta = 1;
          scrollTop += ((scrollTopNext - scrollTop) * delta);
        }
      }

      // we calculated to show the right part at the top of the view,
      // now adjust to actually scroll it to the middle of the view or the relative cursor position.
      var relative = (info.viewLine - info.viewStartLine) / (info.viewEndLine - info.viewStartLine + 1);
      scrollTop = Math.max(0, scrollTop - (info.height != null ? info.height : document.body.clientHeight) * relative ) | 0; // round it
    }

    // exit if we are still at the same scroll position
    if (scrollTop === lastScrollTop && !info.force) return false;
    lastScrollTop = scrollTop;

    // otherwise, start scrolling
    animateScrollTop(window, scrollTop, info.duration != null ? info.duration : 250);
    return true;
  }


  /*-------------------------------------------------------
     Slide navigation
  -------------------------------------------------------*/
  function getSlidesElem() {
    var elems = document.getElementsByClassName("slides");
    return elems[0];
  }

  function getSlideIndices(slide) {
    var slides = getSlidesElem();
    if (!slides) return null;
    var h = 0;
    var section = slides.firstElementChild;
    while(section) {
      if (section.nodeName==="SECTION") {
        if (section===slide) return { h: h, v: 0 };
        if (/\bvertical\b/.test(section.className)) {
          var v = 0;        
          var vsection = section.firstElementChild;
          while(vsection) {
            if (vsection===slide) return {h:h,v:v};
            if (vsection.nodeName==="SECTION") {
              v++;
            }
            vsection = vsection.nextElementSibling;
          }
        }
        h++;
      }
      section = section.nextElementSibling;
    }
    return null;
  }

  function scrollToSlide(info) {
    if (typeof(Reveal)==="undefined" || !Reveal.isReady()) return false;
    var pos0 = Reveal.getIndices();
    var elem = info.elem;
    // check for the last line, and redirect to the last slide
    if (elem && elem.previousElementSibling && /\breveal\b/.test(elem.previousElementSibling.className)) {
      elem = elem.previousElementSibling.firstElementChild.lastElementChild;
    }
    while(elem && elem.nodeName !== "SECTION") {
      elem = elem.parentNode;
    }
    if (!elem) return false;
    var pos = getSlideIndices(elem);
    if (!pos) return false;
    if (pos.h !== pos0.h || pos.v !== pos0.v) {  // only call if the position changed.
      Reveal.slide(pos.h,pos.v);
    }
    return true;
  }


  /*-------------------------------------------------------
     Load content
  -------------------------------------------------------*/
  function findTextNode( elem, text ) {
    if (!elem || !text) return null;
    if (elem.nodeType===3) {
      if (elem.textContent === text) return elem;      
    }
    else {
      for( var child = elem.firstChild; child != null; child = child.nextSibling) {
        var res = findTextNode(child,text);
        if (res) return res;
      }
    }
    return null;  
  }

  
  function dispatchEvent( elem, eventName ) {
    var event;  
    if (document.createEvent) {
        event = document.createEvent('Event');
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

  // we only load script tags once in the preview (and never remote them)
  var loadedScripts = {};

  function onLoaded(src) {
    if (src) {
      loadedScripts["/" + src] = true;
    }
    for(var script in loadedScripts) {
      if (loadedScripts[script] !== true) return;
    }
    dispatchEvent(document,"load");
  }

  function loadContent(info) {
    if (info.oldText) {
      //console.log("  try quick update:\n old: " + info.oldText + "\n new: " + info.newText);
      var elem = findTextNode( document.body, info.oldText );
      if (elem) {
        // yes!
        console.log("preview: quick view update" );
        elem.textContent = info.newText;        
        return;
      }
    }
    // do a full update otherwise 
    // note: add a final element to help the scrolling to the end.
    var finalElem = (typeof info.lineCount === "number" ? "<div data-line='" + info.lineCount.toFixed(0) + "'></div>" : "");
    document.body.innerHTML = info.content + finalElem;
    // execute inline scripts
    var scripts = document.body.getElementsByTagName("script");   
    for(var i=0;i<scripts.length;i++) {  
      var script = scripts[i];
      var src = script.getAttribute("src");
      if (!src) {
        eval(scripts[i].text);  
      }
      else if (loadedScripts["/" + src]==null && /\bpreview\b/.test(script.className)) {
        loadedScripts["/" + src] = false;  // inserted, but not yet loaded by the browser
        var xscript = document.createElement("script");     
        // listen for load events
        xscript.onreadystatechange = function(ev) {
          if (this.readyState==="complete" || this.readyState==="loaded") {
            onLoaded( this.src );
          }
        }
        xscript.onload = function(ev) { onLoaded(this.src); }
        var attrs = script.attributes;
        for(var j = 0; j < attrs.length; j++) {
          xscript.setAttribute( attrs[j].name, attrs[j].value );
        }              
        document.documentElement.appendChild(xscript);
      }
    }  
    // append script to detect onload event
    var loaded = document.createElement("script");
    loaded.type = "text/javascript";
    var code = "Preview.onLoaded();";
    loaded.appendChild( document.createTextNode(code));
    document.body.appendChild(loaded);    
  }

  document.addEventListener("load", function(ev) {
    window.parent.postMessage(JSON.stringify({eventType:'previewContentLoaded'}),origin);
    var refs = document.getElementsByTagName("a");
    for(var i = 0; i < refs.length; i++) {
      var ref = refs[i];
      if (!/\blocalref\b/.test(ref.className) && origin !== ref.protocol + "//" + ref.host && !ref.target) {
        ref.target = "_blank"; // make all non-relative links open in a new window
      }
    }
    // reveal support
    if (typeof(Reveal) !== "undefined") {
      revealRefresh();
    }
  });

  function revealRefresh( query ) {
    if (typeof(Reveal)==="undefined") return;
    if (!Reveal.config) {
      if (typeof(revealConfig) !== "undefined") 
        Reveal.config = revealConfig;
      else {
        Reveal.config = {  
          controls: true,
          progress: true,
          center: true,
          history: false,
        };
      }
    }

    // parse the query
    if (query) {
      var rx = /(\w+)=([\w\.%\-]*)/g;
      var cap;
      while( cap = rx.exec(query) ) {
        var s = decodeURIComponent(cap[2]);
        Reveal.config[cap[1]] = (s==="null" ? null : (s==="true" ? true : (s === "false" ? false : s))); 
      }
    }

    // remember our position, and initialize special elements
    var pos = (Reveal.isReady() ? Reveal.getIndices() : { h: 0, v: 0, f:undefined });
    if (!query) {
      var items = document.querySelectorAll( ".fragmented>li" );
      for(var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && !/\bfragment\b/.test(item.className)) item.className = item.className + " fragment";
      }
      items = document.querySelectorAll('a[href^="?"]'); // get all query references
      for(var i = 0; i < items.length; i++) {
        var item = items[i];
        var query = item.getAttribute("href");
        var listen = function(q) { // we pass query to a function to capture it fresh in q for every element
          item.addEventListener("click", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            revealRefresh( q );
          });
        };
        listen(query); 
      }
    }
    
    // remove class names on reveal element that otherwise prevent transitions from updating
    var elem = document.querySelectorAll("div.reveal")[0];
    if (elem) elem.className="reveal";

    // re-initialize and restore position
    Reveal.initialize(Reveal.config);
    Reveal.slide(pos.h,pos.v,pos.f);      
  }


  /*-------------------------------------------------------
     React to messages
  -------------------------------------------------------*/
  window.addEventListener("message", function(ev) {
    // check origin and source element so no-one else can send us messages
    if (ev.origin !== origin) return;
    if (ev.source !== window.parent) return;

    var info = JSON.parse(ev.data);
    if (!info || !info.eventType) return;
    if (info.eventType==="scrollToLine") {
      //console.log("scroll to line: " + info.textLine.toString() + " in " + info.duration);
      scrollToLine(info);
    }
    else if (info.eventType==="scrollToY") {
      setScrollTop(window,info.scrollY);
    }
    else if (info.eventType==="loadContent") {      
      loadContent(info);
      //ev.source.postMessage('contentLoaded',ev.origin);
    }
    else if (info.eventType==="view") {
      document.body.setAttribute("data-view",info.view);
    }
  });



  /*
  try {
    var req = new XMLHttpRequest();
    var url = "https://madoko.cloudapp.net/index.html";
    req.open("GET", url, true );
    req.onload = function(res) {
      console.log("PREVIEW WARNING: can access root domain!!");
    };
    req.onerror = function(res) {
      console.log("PREVIEW OK: cannot access root domain");    
    }
    req.send(null);
  }
  catch(exn) {
    console.log("PREVIEW OK: cannot do XHR: " + exn.toString());
  }

  try {
    var ticks = localStorage.getItem( "ticks" );
    console.log("PREVIEW WARNING: can access local storage for root domain!!")
  }
  catch(exn) {
    console.log("PREVIEW OK: cannot access local storage for root domain.")
  }
  
  try {
    var cookie = document.cookie;
    console.log( "PREVIEW WARNING: could accesss cookie for root domain!!");
  }
  catch(exn) {
    console.log("PREVIEW OK: cannot access cookies of root domain.")
  }
  */

  //console.log("previewjs loaded: " + origin);

  return {
    onLoaded: onLoaded,
  };
})();
