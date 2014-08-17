/*   
/*      ▄████████    ▄███████▄  ▄█  ████████▄     ▄████████    ▄████████ 
/*     ███    ███   ███    ███ ███  ███   ▀███   ███    ███   ███    ███ 
/*     ███    █▀    ███    ███ ███▌ ███    ███   ███    █▀    ███    ███ 
/*     ███          ███    ███ ███▌ ███    ███  ▄███▄▄▄      ▄███▄▄▄▄██▀ 
/*    ▀██████████ ▀█████████▀  ███▌ ███    ███ ▀▀███▀▀▀     ▀▀███▀▀▀▀▀   
/*            ███   ███        ███  ███    ███   ███    █▄  ▀███████████ 
/*      ▄█    ███   ███        ███  ███   ▄███   ███    ███   ███    ███ JS
/*    ▄████████▀   ▄████▀      █▀   ████████▀    ██████████   ███    █▀ 
/*
/*   Web crawler and scraping engine
/*
/**/
( function() {
	'use strict';
	
	var querystring = require('querystring'),
		debug = require('debug')('spider'),

		cheerio = require('cheerio'),
		request = require('request'),
		events = require('events'),
		util = require('util'),
		_ = require('lodash'),
		q = require('q');

	function Spider(options) {
		var spider = this;

		if ( !_.isObject(options) )
			throw new Error('Options is missing.');
		
		this.counts      = { retries: 0, pages: 0, items: 0 };
		this.maxRetries  = options.maxRetries || 100;
		this.alive       = false;
		
		this.headers = _.defaults(options.headers || {}, {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.143 Safari/537.36',
		});

		this.urlTemplate = options.urlTemplate;
		this.scraper     = options.scraper;
		this.proxy       = options.proxy || null;

		this.defaults    = _.extend(options.defaults || {}, {
			start: 0,
			windowSize: 100,
		});

		if ( !this.urlTemplate ) {
			this.urlTemplate = function(params) {
				return params.query 
			};
			this.urlTemplate.isStatic = true;
		}
	};

	// Prototype inheritance - EventEmitter
	//
	Spider.prototype = Object.create( events.EventEmitter.prototype );

	// Start the spider
	Spider.prototype.start = function startSpider(target) {
		debug('Starting using scraper: ' + this.scraper.name);

		this.alive = true;
		this.emit('start', target, this);

		this.move( _.defaults(target, this.defaults) );
	};

	// Move the spider to an address
	Spider.prototype.move = function moveSpider(target) {
		if ( !this.alive ) return;
		var spider = this;

		// Build the URL
		var query = {
			url: spider.urlTemplate(target),
			proxy: spider.proxy,
			headers: spider.headers,
		};

		// Do an http request
		debug('Moving '+query.url);
		spider.emit('move', query);

		request(query, function parseHtml(err, res, body) { 
			spider.parseHtml(err, res, body, target); 
		});
	};

	// Parse the response of an HTTP request 
	Spider.prototype.parseHtml = function htmlParser(err, res, body, target) {
		var spider = this,
			counts = spider.counts;

		// On Success
		if (!err && 200 >= res.statusCode && res.statusCode < 400) {
			debug('Got OK :)');

			var data = spider.scraper(body);

			counts.items += data.items.length;
			data.page    =  ++counts.pages;

			debug('Sending data.');
			spider.emit('data', data);

			if ( data.more && !spider.urlTemplate.isStatic ) {
				target.start += target.windowSize;

				spider.moveTimeout = setTimeout( function() {
					spider.moveTimeout = null;
					spider.move(target);
				}, spider.nextPageDelay);

			} else
				spider.kill({ code: 200, message: 'Spider finished. Info: '+util.inspect(counts) });
		}

		// On Error
		else {
			var message = { code: (err ? err.code : null) || res.statusCode || 500, message: ( err ? err.message || err : '') };

			spider.counts.retries++;

			// Our IP probably got blocked.
			//
			if ( spider.counts.retries < spider.maxRetries ) {
				debug('Our IP was blocked. (Retry '+spider.counts.retries+')');
				spider.emit('ipBlocked', target, message, spider);
			}

			else {
				spider.kill('Rejected. Max retries reached. Aborting.');
			}
		}
	};

	// Stops the spider
	Spider.prototype.kill = function stopSpider(data) {
		_.defaults(data, { message: 'Stopping spider', code: 500 });

		clearTimeout(this.moveTimeout);

		debug(data.code+': '+data.message);

		this.alive = false;
		this.emit('finish', data);
	};

	exports = module.exports = Spider;

}());
