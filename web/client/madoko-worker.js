/*---------------------------------------------------------------------------
  Copyright 2013 Microsoft Corporation.
 
  This is free software; you can redistribute it and/or modify it under the
  terms of the Apache License, Version 2.0. A copy of the License can be
  found in the file "license.txt" at the root of this distribution.
---------------------------------------------------------------------------*/

importScripts("lib/require.js");

require.config({
  baseUrl: "lib",
});


var heartbeat = 0;
setInterval( function() {
  heartbeat++;
  self.postMessage( { messageId: -1, heartbeat: heartbeat } );
}, 15000);

require(["../scripts/util","webmain"], function(util,madoko) 
{
  // remove duplicates
  function nub( xs ) {
    if (!xs || xs.length <= 0) return [];
    var seen = {};
    var ys = [];
    for(var i = 0; i < xs.length; i++) {
      if (!(seen["$" + xs[i]])) {
        seen["$" + xs[i]] = true;
        ys.push(xs[i]);
      }
    }
    return ys;
  }

  // split a string of files (one per line) into an array of files
  function fileList( files ) {
    if (!files) return [];
    return nub(files.split("\n").filter(function(s) { 
      return (s); // && !local.contains(s)); 
    }));
  }

  function fileWriteKeep(fname) {
    return (util.endsWith(fname,"-bib.aux"));
  }

  function fileWriteList(files) {
    if (!files) return [];
    var written = nub(files.split("\n").filter(function(fname) {
      return (fname && fileWriteKeep(fname));
    }));
    return written.map( function(fname) {
      var content = madoko.readTextFile(fname);
      local.set(fname,true);
      return { path: fname, content: content };
    });
  }

  function mathDoc(files) {
    if (!files) return "";
    var mdocs = nub(files.split("\n")).filter( function(fname) {
      return (fname && (util.endsWith(fname,"-bib.aux") ||
                        util.endsWith(fname,"-math-dvi.tex") || 
                        util.endsWith(fname,"-math-pdf.tex")));
    });
    if (!mdocs) return "";
    var mcontents = mdocs.map( function(fname) {
      return madoko.readTextFile(fname);
    });
    return mcontents.join().replace(/\n[ \t]*%[ \t]*data-line=.*/mg, "" );
  }

  var local = new util.Map(); // filename -> bool

  self.addEventListener( "message", function(ev) {
    try {    
      var req = ev.data;
      if (req.type === "clear") {
        local = new util.Map();
        madoko.clearStorage();
        self.postMessage( {
          messageId: req.messageId,
          err: null,
        });
      }
      else if (req.type === "delete") {
        if (req.files) {
          req.files.forEach( function(f) {
            madoko.unlinkFile(f.path);
            local.remove(f.path);
          });
        }
        self.postMessage( {
          messageId: req.messageId,
          err: null,
        });
      }
      else {
        if (req.files) {
          req.files.forEach( function(f) {
            madoko.writeTextFile(f.path,f.content);  
            local.set(f.path,true);
          });
        }

        var t0 = Date.now();            
        madoko.markdown(req.name,req.content,"out",req.options, 
                         function(md,stdout,runOnServer,options1,filesRead,filesReferred,filesWrite) 
        {
          self.postMessage( {
            messageId  : req.messageId, // message id is required to call the right continuation
            name       : req.name,
            content    : md,
            time       : (Date.now() - t0).toString(),
            options    : options1,
            runOnServer: runOnServer,
            message    : stdout,
            filesRead  : fileList(filesRead),         
            filesReferred: fileList(filesReferred),
            filesWritten: fileWriteList(filesWrite),
            mathDoc    : mathDoc(filesWrite),
            err        : null,
          });
        });
      }
    }
    catch(exn) {
      self.postMessage( {
        messageId: req.messageId,
        message  : exn.toString(),
        err      : exn.toString(),
      });
    }
  });

  self.postMessage( { messageId: 0 }); // signal we are ready
});
