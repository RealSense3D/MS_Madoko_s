/*---------------------------------------------------------------------------
  Copyright 2013 Microsoft Corporation.
 
  This is free software; you can redistribute it and/or modify it under the
  terms of the Apache License, Version 2.0. A copy of the License can be
  found in the file "license.txt" at the root of this distribution.
---------------------------------------------------------------------------*/
var dns     = require("dns");

var Fs      = require("fs");
var Path    = require("path");

var Promise = require("./client/scripts/promise.js");
var Map     = require("./client/scripts/map.js");
var date    = require("./client/scripts/date.js");


function readDir(dir) {
  return new Promise( function(cont) { 
  	Fs.readdir(dir,cont); 
  });
}

function readFile( path, options ) {
  return new Promise( function(cont) {
    Fs.readFile( path, options, cont );
  });
}


function writeFile( path, content, options ) {
  return new Promise( function(cont) {
    Fs.writeFile( path, content, options, cont );
  });
}

function parseLogs(dir) {
	dir = dir || "log";
	return readDir( dir ).then( function(fnames) {
		fnames = fnames.filter( function(fname) { return /log-[\w\-]+\.txt/.test(Path.basename(fname)); } );
		return Promise.when( fnames.map( function(fname) { 
			//console.log("read: " + fname);
			return readFile(Path.join(dir,fname),{encoding:"utf8"}); 
		})).then( function(fcontents) {
			var datas = fcontents.map( function(content) { 
				if (!content || content.length<=0) return [];
				if (content[0] === "[") return JSON.parse(content); // older log
			  var lines = content.split("\n");
			  return lines.map(function(line){ 
			  	return (line ? JSON.parse(line) : {type:"none"});   // new logs are line separated JSON objects
			  });
			});
			var entries = [].concat.apply([],datas);
			entries.forEach( function(entry) {
				// normalize
				if (!entry.date && entry.start) {
					entry.date = new Date(entry.start).toISOString();
				}
				if (!entry.type) {
					if (entry.error) entry.type = "error";
					else if (entry.url==="/rest/run" && entry.user && entry.time) entry.type = "user"; 
					else entry.type = "request";
				}
				//else if (entry.date && typeof entry.date === "string") {
				//	entry.date = date.dateFromISO(entry.date);
				//}
			});
			return entries; 
		})
	});
}

function sum(xs) {
	var total = 0;
	if (xs != null && xs.length > 0) {
		for(var i = 0; i < xs.length; i++) {
			total += xs[i];		
		}
	}
	return total;
}

function avg(xs) {
	var total = 0;
	var n = 0;
	if (xs != null && xs.length > 0) {
		for(var i = 0; i < xs.length; i++) {
			total += xs[i];
			if (xs[i] != 0) n++;
		}
	}
	if (n==0) return 0;
	return Math.round(total/n);
}



function max(xs) {
	var m = 0;
	for(var i = 0; i < xs.length; i++) {
		if (xs[i] > m) m = xs[i];
	}
	return m;
}

function digestUsers(entries) {
	var users = new Map();
	entries.forEach( function(entry) {
		if (entry.user == null || entry.user.id == null) return;
		var userEntries = users.getOrCreate(entry.user.id, []);
		userEntries.push(entry);
	});
	users = users.map( function(id,uentries) {
		var delta = 10*60*1000; // 10 minutes
		var total = 60*1000;    // 1 minute
		var prevTime = 0;
		uentries.forEach( function(entry) {
			var nextTime = date.dateFromISO(entry.date).getTime();
			if (prevTime===0) {
				prevTime = nextTime;
			}
			else if (prevTime + delta > nextTime) {
				total += (nextTime - prevTime);
				prevTime = nextTime;
			}
		});
		return {
			workTime: total,
			reqCount: uentries.length,
			id: id,
		}
	});
	return users.elems();
}

function writeStats( fname, obj ) {
  return readFile("stats-template.html",{encoding:"utf-8"}).then( function(content) {
  	var json = JSON.stringify(obj);
  	JSON.parse(json);
    content = content.replace("<STATS>",json);
    return writeFile(fname,content);
  });
}

function digestDaily(entries) {
	var daily = new Map();
	entries.forEach( function(entry) {
		var date = entry.date.replace(/T.*/,"");
		var dateEntries = daily.getOrCreate(date,[]);
		if (!entry.size) {
			if (entry.files) {
				entry.size = sum( entry.files.map( function(file) { return file.size; } ) );
			}
			else {
				entry.size = 0;
			}
		}
		dateEntries.push(entry);
	});
	daily = daily.map( function(date,dentries) {		
		var users = digestUsers(dentries);
		var runEntries = dentries.filter( function(entry) { return entry.url === "/rest/run"; })
		var pagesEntries = dentries.filter( function(entry) { return entry.type === "pages"; })
		return { 
			userCnt: users.length,
			users: users.map( function(entry) { return entry.id; }),
			pagesCnt: sum( pagesEntries.map( function(entry) { return entry.pagesCount; })),
			pageIdxCnt: sum( pagesEntries.map( function(entry) { 
				var ipages = entry.pages.filter(function(page) { return (page.key==="/" || page.key=="/index.html" || page.key=="/editor.html"); });
				return sum(ipages.map( function(page) { return page.value; })); 
			})),
			reqCount: dentries.length,
			avgWTm: Math.ceil( avg( users.map( function(entry) { return entry.workTime; }) ) / (60*1000) ),
			maxWTm : Math.ceil( max( users.map( function(entry) { return entry.workTime; }) ) / (60*1000) ),
			avgSTm: avg( runEntries.map( function(entry) { return entry.time; }) ),
			maxSTm: max( runEntries.map( function(entry) { return entry.time; }) ),
			avgSTm: avg( runEntries.map( function(entry) { return entry.size; }) ),
			maxSSz: max( runEntries.map( function(entry) { return entry.size; }) ),
			//entries: dentries.map( function(entry) { return entry.user.id; } ),
		};
	});	
	
	var knownUsers = new Map();
	var knownCount = 0;
	daily.forEach( function(date,entry) {
		entry.users.forEach( function(id) {
			if (!knownUsers.get(id)) {
				knownUsers.set(id,true);
				knownCount++;
			}
		});
		delete entry.users;
		entry.cumUserCnt = knownCount;
	});

	return daily;
}

function anonIP(ip) {
	return (ip ? ip.replace(/\.\d+\s*$/, ".***") : "");
}

function anon(s) {
	if (!s) return "";
	return s.replace(/[a-zA-Z]:[\\\/][\w\-\_\.\\\/]*\bmadoko[\/\\]/,"");
}

function anonURL(s) {
	if (!s) return "";
	return s.replace(/[?#].*$/,"");
}

function reverse(xs) {
	if (!xs) return;
	var res = [];
	xs.forEach( function(x) { res.unshift(x); });
	return res;
}

function anonDomain(d) {
	if (!d) return "";
	if (d instanceof Array) return d.join(",");
	return d.toString();
}

function digestErrors( entries ) {
	var errors = [];
	var scans = new Map();
	var rejects = 0;
	var pushfails = 0;
	entries.forEach( function(entry) {
		if (!((entry.type === "error" && entry.error) || entry.type==="static-scan")) return;
		if (entry.type === "static-scan") {
			if (!(/^\/(styles|preview)\/math\/math-|\/templates\/(article|default|presentation|webpage).mdk$/.test(entry.url))) {
				var e = scans.getOrCreate(entry.url,{ url: entry.url, domain:"", count: 0, ip:anonIP(entry.ip), });
				e.domain += anonDomain(entry.domains || entry.domain);
				e.date = entry.date;
				e.count++;
			}
		}
		else if (/is not allowed access|is not on the white list/.test(entry.error.message)) {
			rejects++;
		}
		else if (entry.url==="/rest/push-atomic" && /^failed\b/.test(entry.error.message)) {
			pushfails++;
		}
		else {
			errors.unshift( {
				msg: anon(entry.error.message || "<unknown>"),
				ip: anonIP(entry.ip),
				domain: anonDomain(entry.domains || entry.domain),
				url: anonURL(entry.url),
				date: entry.date,
			});
		}
	});
	return { errors: errors.slice(0,100), rejects: rejects, pushfails: pushfails, scans: reverse(scans.elems()) };
}

function digestDomains(entries) {
	var domains = new Map();
	entries.forEach( function(entry) {
		if (entry.ip) {
			var key = entry.ip.replace(/\.\d+$/, "");
			var e = domains.getOrCreate( key,  {
				count: 0,
				ip: anonIP(entry.ip),
				domain: anonDomain(entry.domains || entry.domain),
			});
			e.count++;
		}
	});
	return reverse(domains.elems()).sort( function(x,y) { return y.count - x.count; }).slice(0,25);
}

function resolveDomains(entries) {
	return Promise.when( entries.map( function(entry) {
		if (entry.domain || !entry.ip) return Promise.resolved();
		try {
			return dns.reverse(entry.ip, function(err,doms) {
				if (err || !doms) return;
				console.log(doms)
				entry.domain = doms.join(",");
			});
		}
		catch(exn) {
			//entry.domain = exn.toString();
			return Promise.resolved();
		}
	}));
}

function writeStatsPage( fname ) {
	if (!fname) fname = "client/private/stats.html";
	var start = Date.now();
	return parseLogs().then( function(entries) {
		console.log("stats: total entries: " + entries.length );
		var xentries = entries.filter(function(entry){ return (entry.date && entry.type !== "error"); });
		var errors = digestErrors(entries);
		console.log("stats: total errors: " + errors.errors.length );
		console.log("stats: total scans: " + errors.scans.length );
		var domains  = digestDomains(entries);
		return resolveDomains(domains).then( function() {
			var stats = {
				daily: digestDaily(xentries).keyElems(),
				errors: errors,
				domains: domains,
				userCount: digestUsers(xentries).length,
				date: new Date(),
			};
			console.log("stats: total time: " + (Date.now() - start).toString() + " ms");
			return writeStats( fname, stats );
		});
	}).then( function() {
		console.log("updated stats.");
	}, function(err) {
		console.log("unable to write stats:")
		console.log(err.stack);
	});
};

module.exports.writeStatsPage = writeStatsPage;

if (!module.parent) {
	writeStatsPage();
}


