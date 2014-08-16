/*   
/*      ▄████████    ▄███████▄  ▄█  ████████▄     ▄████████    ▄████████ 
/*     ███    ███   ███    ███ ███  ███   ▀███   ███    ███   ███    ███ 
/*     ███    █▀    ███    ███ ███▌ ███    ███   ███    █▀    ███    ███ 
/*     ███          ███    ███ ███▌ ███    ███  ▄███▄▄▄      ▄███▄▄▄▄██▀ 
/*    ▀██████████ ▀█████████▀  ███▌ ███    ███ ▀▀███▀▀▀     ▀▀███▀▀▀▀▀   
/*            ███   ███        ███  ███    ███   ███    █▄  ▀███████████ JS
/*      ▄█    ███   ███        ███  ███   ▄███   ███    ███   ███    ███ 
/*    ▄████████▀   ▄████▀      █▀   ████████▀    ██████████   ███    █▀ 
/*
/*   Web crawler and scraping engine
/*
/**/
var querystring = require('querystring'),
	debug = require('debug')('spider'),
	cheerio = require('cheerio'),
	request = require('request'),
	events = require('events'),
	_ = require('lodash'),
	q = require('q');

function Spider(options) {
	var spider = this;

	if ( !_.isObject(options.engine) )
		throw new Error('Engine is missing.');
	
	this.engine      = options.engine;
	this.proxy       = options.proxy || null;
	this.name        = util.random.name();
	this.counts = { retries: 0, pages: 0, items: 0 };

	this.urlTemplate = options.urlTemplate || options.engine.urlTemplate;

	if ( !this.urlTemplate ) {
		this.urlTemplate = function(params) { return params.query };
		this.urlTemplate.isStatic = true;
	}

	// Start the spider
	//

	debug('Starting scraper spider "'+spider.name+'" using engine: ', this.engine.scrapper.name);

	spider.alive = true;
	spider.emit('start', spider);

	var target = _.defaults(options.target, engine.defaults);

	spider.move(target);
};

// Prototype inheritance - EventEmitter
//
Spider.prototype = Object.create( events.EventEmitter.prototype );

// Move the spider to an address
Spider.prototype.move = function moveSpider(target) {
	if ( !this.alive ) return;
	var spider = this;

	// Build the URL
	var query = {
		url: spider.engine.urlTemplate(target),
		proxy: spider.proxy,
	};

	// Do an http request
	debug('Moving to '+query.url);
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

		var data = spider.engine.scrapper(body);

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
		var message = { code: err.code || res.statusCode || 500, message: err.message || err || '' },
			spider = this;

		spider.counts.retries++;

		// Our IP probably got blocked.
		//
		if ( spider.counts.retries < spider.maxRetries ) {
			debug('Sending ipBlocked');
			spider.emit('ipBlocked', target, message, spider);

			//spider.eventHandler('ipBlocked').then( function() { spider.move() }, spider.kill );
		}

		else {
			spider.kill('Rejected. Max retries reached. Aborting.');
		}
	}
}; 

// Stops the spider
Spider.prototype.kill = function stopSpider(data) {
	_.defaults(data, { message: 'Stopping spider', code: 500 });

	clearTimeout(spider.moveTimeout);

	debug(data.code+': '+data.message);

	this.alive = false;

	debug('Sending finish');
	this.emit('finish', data);
};

exports = module.exports = Spider;