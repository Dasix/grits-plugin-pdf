// Deps
//var system = require("system");

// Constructor
var c = module.exports = function( options, logger ) {

	// Locals
	var me = this;

	// Store the options
	me.options = options;

	// Store the logger
	me.logger = logger;

	// Init resource trackers
	me.resources = {
		req: [],
		rec: [],
		err: []
	};
	me.urls = {};

};

// For convenience
var p = c.prototype;

/**
 * Attaches the resource manager to a page object.
 */
p.attachToPage = function( page ) {

	var me = this;
	var log = me.logger.log.bind( me.logger );

	page.onResourceRequested = function( request, rd ) {

		// Store request reference
		me.resources.req.push( request );

		// Update URL to mimic website behavior
		var newUrl = request.url.replace( me.options.base, me.options.basePath );
		rd.changeUrl( newUrl );

		// Update status
		me.stat( "req", newUrl );

	};

	page.onResourceReceived = function(response) {

		// Store response reference
		me.resources.rec.push( response );

		// Update status
		me.stat( "rec", response.url );

	};

	page.onResourceError = function(resourceError) {

		// Store error reference
		me.resources.err.push( resourceError );

		// Update status
		me.stat( "err", resourceError.url );

	};

};

p.waitForResources = function( cb ) {

	var me = this;
	var timer;

	if( me.checkResources() === true ) {

		// If all resources are loaded immediately
		// then we can return early.
		cb();

	} else {

		// Otherwise we need to poll until the
		// resources have fully loaded.
		timer = setInterval( function() {

			if( me.checkResources() === true ) {
				clearInterval( timer );
				cb();
			}

		}, 50 );

	}

};



p.checkResources = function() {

	var me = this;
	var counts = me.getCounts();

	if( counts.rec >= counts.req ) {
		return true;
	} else {
		return false;
	}

};

p.stat = function( action, url ) {

	// Locals
	var me 	= this;
	var log = me.logger.log.bind( me.logger );

	// Add a tracking variable for this url
	if( me.urls[url] === undefined ) {
		me.urls[url] = {
			req: false,
			rec: false,
			err: false
		};
	}

	// Update tracker status
	me.urls[url][action] = true;

};

p.getCounts = function() {

	var me 	= this;
	var log = me.logger.log.bind( me.logger );
	var req = 0;
	var rec = 0;
	var err = 0;

	for (var prop in me.urls) {
    	if ( me.urls.hasOwnProperty( prop ) ) {

        	var u = me.urls[ prop ];

        	if( u.req === true ) {
        		req++;
        	}
        	if( u.rec === true ) {
        		rec++;
        	}
        	if( u.err === true ) {
        		err++;
        	}

    	}
	}

	return {
		req: req,
		rec: rec,
		err: err
	};

};

p.debugStatusDetail = function() {

	var me 	= this;
	var log = me.logger.log.bind( me.logger );
	var rs 	= me.resources;


	log( "------------------------------------------------------------------------------------------------" );
	for (var prop in me.urls) {
    	if ( me.urls.hasOwnProperty( prop ) ) {

        	var u = me.urls[ prop ];

        	log( prop );
        	log("   -> req: " + u.req );
        	log("   -> rec: " + u.rec );
        	log("   -> err: " + u.err );

    	}
	}


};

p.debugStatusCounts = function() {

	// Locals
	var me 	= this;
	var log = me.logger.log.bind( me.logger );
	var rs 	= me.resources;
	var counts = me.getCounts();

	log( "------------------------" );

	/*
	log( "Requested : " + rs.req.length );
	log( "Received  : " + rs.rec.length );
	log( "Errored   : " + rs.err.length );
	log( "~~" );
	*/

	log( "Requested : " + counts.req );
	log( "Received  : " + counts.rec );
	log( "Errored   : " + counts.err );

};

