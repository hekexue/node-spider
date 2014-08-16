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
	debug = require('debug')('scraper:spider'),
	cheerio = require('cheerio'),
	request = require('request'),
	events = require('events'),
	_ = require('lodash'),
	q = require('q');

function Spider(venom) {
	var spider = this;

	if ( !_.isObject(venom.engine) )
		throw new Error('Engine is missing.');
	
	// The engine is the object that provides the urlTemplate, the default params and the scraper function.
	// The scraper function takes in HTML and returns an object containing:
	//   @param items - Array: The items scrapped out of the page
	//   @param more - Boolean: If this is set, the spider will query the next page
	//
	this.engine      = venom.engine;

	// The urlTemplate is an instance of _.template, and its used to build the query strings.
	// This is overridable
	this.urlTemplate = venom.urlTemplate || venom.engine.urlTemplate;

	// If proxy is set, the spider will crawl using this proxy
	this.proxy       = venom.proxy || null;


	// Start the spider
	//
	spider.name        = util.random.name();

	debug('Starting scraper spider "'+spider.name+'" using engine: ', this.engine.process.name);

	spider.counts = { retries: 0, pages: 0, items: 0 };
	spider.alive = true;
	spider.emit('start', spider);

	var params = _.defaults(venom.params, engine.defaults);

	spider.move(params);
};

// Prototype inheritance - EventEmitter
//
// The following events can be emitted from a spider:
// 'start'     - The spider is initialized
// 'move'      - The spider start a HTTP request
// 'data'      - The spider scrape results
// 'ipBlocked' - Our IP gets rejected from the server (Useful to handle IP changes or else)
// 'finish'    - The spider finishes
//
Spider.prototype = Object.create( events.EventEmitter.prototype );

// Move the spider to an address
Spider.prototype.move = function moveSpider(params) {
	if ( !this.alive ) return;
	var spider = this;

	// Build the URL
	var query = {
		url: spider.urlTemplate(params),
		proxy: spider.proxy,
	};

	// Do an http request
	spider.emit('move', query);

	request(query, function parseHtml(err, res, body) { 
		spider.parseHtml(err, res, body, params); 
	});
};

// Parse the response of an HTTP request 
Spider.prototype.parseHtml = function htmlParser(err, res, body, params) {
	var spider = this,
		counts = spider.counts;

	// On Success
	if (!err && 200 >= res.statusCode && res.statusCode < 400) {
		debug('Got OK :)');

		var data = spider.engine.scrape(body);

		counts.items += data.items.length;
		data.page    =  ++counts.pages;

		debug('Spider sending data');
		spider.emit('data', data);

		if ( data.more ) {
			params.start += params.windowSize;

			spider.moveTimeout = setTimeout( function() {
				spider.moveTimeout = null;
				spider.move(params);
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
			spider.emit('ipBlocked', params, message, spider);

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
	this.emit('finish', data);
};

exports = module.exports = Spider;