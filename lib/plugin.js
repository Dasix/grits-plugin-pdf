var _              = require( "lodash" );
var tipe           = require( "tipe" );
var Promise        = require( "bluebird" );
var pth            = require( "path" );
var fs             = require( "fs" );
var phantomWrapper = require( "./phantom/index" );
var async		   = require( "async" );

//<editor-fold desc="+++++ Initialization and Config Methods +++++++++">

/**
 * @constructor
 */
var pl = module.exports = function( renderer, config ) {

	// Locals
	var me = this;

	// Set the PDF rendering DPI
	if( config.dpi !== undefined ) {
		me.dpi = config.dpi;
	} else {
		me.dpi = 96;
	}


	// Default page dimensions (US Letter)
	var defaultPageWidthIn = 8.5;
	var defaultPageHeightIn = 11;

	// Set the plugin name (which is REQUIRED for all plugins)
	me.pluginName = "grits-plugin-pdf";

	// Set Config Defaults
	me.$$config = {
		base		: "http://ph.local/",
		type        : "pdf",
		quality     : "100",
		timeout     : 30000,
		phantomArgs : [],
		border : {
			top    : me.inchToPixels( 0.25 ) + "px",
			bottom : me.inchToPixels( 0.25 ) + "px",
			left   : me.inchToPixels( 0.75 ) + "px",
			right  : me.inchToPixels( 0.75 ) + "px"
		},
		defaultHeaderHeight: "30mm",
		defaultFooterHeight: "20mm",
		concurrency : 3,
		//format      : "Letter",
		//orientation : "portrait",
		width: me.inchToPixels( defaultPageWidthIn ) + "px",
		height: me.inchToPixels( defaultPageHeightIn ) + "px",
		viewportSize: {
			width	: me.inchToPixels( defaultPageWidthIn ),
			height	: me.inchToPixels( defaultPageHeightIn )
		},
		settings: {
			dpi		: me.dpi
		}
	};


	// Apply 'config' param
	me.setConfig( config );

	// Store ref
	me.$$grits = renderer;

};

// For convenience
var pr = pl.prototype;

pr.inchToPixels = function( inches ) {

	//page.viewportSize = { width: 1238, height: 1763 };
	//page.paperSize = {width:'1238px', height:'1763px'};
	//page.settings.dpi = 150;

	//var dpi = 150;

	var me = this;
	var pixels = inches * me.dpi;
	return Math.floor( pixels );

};

/**
 * Sets one or more configuration settings.
 *
 * @instance
 * @access public
 * @param {object} config
 * @returns {void}
 */
pr.setConfig = function( config ) {
	var me = this;
	_.each( config, function( v, k ) {
		me.$$config[ k ] = v;

		if( k === "dpi" ) {
			me.dpi = v;
			//me._onDpiUpdated();
		}

	});
};

/**
 * Returns the current plugin configuration.
 *
 * @instance
 * @access public
 * @returns {object}
 */
pr.getConfig = function() {
	return this.$$config;
};

/**
 * Builds options for Phantom.js rendering..
 *
 * @instance
 * @access private
 * @param {Dasix.grits.File} htmlFile The HTML source file.
 * @returns {object}
 */
pr._getPhantomOptions = function( htmlFile ) {

	var me = this;
	var ret = _.cloneDeep( me.$$config );

	// Configure 'basePath'
	ret.basePath = "file://" + htmlFile.getBasePath() + "/";

	// Finished
	return ret;

	/*

	 httpHeaders : {},
	 header      : {
		 height   : "45mm",
		 contents : "<div style=\"text-align: center;\">Author: Marc Bachmann</div>"
	 },
	 footer      : {
	 	height   : "28mm",
	 	contents : "<span style=\"color: #444;\">{{page}}</span>/<span>{{pages}}</span>"
	 }

	 */

};

//</editor-fold>

/**
 * The Grits renderer will call this method after each HTML render.
 *
 * @instance
 * @access public
 * @param {Dasix.grits.Renderer} renderer The Grits renderer object.
 * @returns {void}
 */
pr.onDustRender = function( renderer, ev ) {

	// Check for context.pdf first
	if( ev.context === undefined || ev.context === null || ev.context.pdf === undefined || ev.context.pdf !== true ) {
		return;
	}

	// Locals
	var me 			= this;
	var src 		= ev.destFile;
	var opts		= me._getPhantomOptions( src );
	var dest 		= me.getDestFile( src, opts.type );

	// Start the log
	me.log("Rendering PDF");
	me.logObject({
		"Source"		: src.getAbsoluteFilePath(),
		"Destination"	: dest.getAbsoluteFilePath()
	});

	// Prep the destination and determine if we can write
	var isWriteable = me.prepDestination( dest );

	// Check for writability
	if( isWriteable === true ) {

		// Get the Render Queue
		var q = me._getRenderQueue();

		// Add the render op to the queue
		q.push(
			{
				name: dest.getAbsoluteFilePath(),
				src: src,
				dest: dest,
				opts: opts
			},
			function onQueueItemComplete( err ) {

				if( !!err ) {

					// Log the failure..
					me.log(" ");
					me.log(" ");
					me.log("Warning! PDF Rendering Failed:");
					me.log( err.message );
					me.log(" ");
					me.log(" ");

				} else {

					// Log that the op has finished
					me.log( "Phantom.js Render Complete: " + dest.getAbsoluteFilePath() );

				}

			}
		);

	} else {

		// Log the failure..
		me.log(" ");
		me.log(" ");
		me.log("Warning! PDF Rendering Skipped: The destination path is not writable, it may be open by another process.");
		me.logObject({
			"Destination"	: dest.getAbsoluteFilePath()
		});
		me.log(" ");
		me.log(" ");

	}

};

/**
 * Gets (and possibly creates) a rendering queue (async.queue).
 *
 * @instance
 * @access private
 * @returns {object}
 */
pr._getRenderQueue = function() {

	var me = this;
	if( me.$$renderQueue === undefined ) {

		var conf = me.getConfig();

		me.$$renderQueue = async.queue(

			function renderQueueWorker( task, callback ) {

				me.log( "Rendering Queue Item: " + task.name );

				// Render the output..
				me._doPhantomRender( task.src, task.dest, task.opts,
					function renderQueueWrapper( err ) {
						callback( err );
					}
				);

			},
			conf.concurrency
		);

		me.$$renderQueue.drain = function() {
			me.log("All PDF rendering tasks have completed");
		};

		me.log("Creating a PDF render queue with concurrency: " + conf.concurrency );

	}
	return me.$$renderQueue;

};

/**
 * This method launches the Phantom.js renderer.
 *
 * @instance
 * @access private
 * @param {Dasix.grits.File} src
 * @param {Dasix.grits.File} dest
 * @param {object} opts
 * @param {function} cb
 * @return {void}
 */
pr._doPhantomRender = function( src, dest, opts, cb ) {

	var me 		= this;
	var html	= fs.readFileSync( src.getAbsoluteFilePath(), "utf8" );

	// Force opts.logFn
	opts.logFn = me.log.bind(me);

	// Runs Phantom.js
	phantomWrapper.create( html, opts ).toFile( dest.getAbsoluteFilePath(), cb );

};


/**
 * Returns a File object that represents the output
 * file for a given HTML input file.
 *
 * @instance
 * @access protected
 * @param {Dasix.grits.File} srcFile
 * @param {?string} [outputType="pdf"]
 * @returns {Dasix.grits.File}
 */
pr.getDestFile = function( srcFile, outputType ) {

	if( outputType === undefined || outputType === null ) {
		outputType = "pdf";
	} else {
		outputType = outputType + "";
	}

	var dest = srcFile.dest(
		srcFile.getBasePath()
	);

	var base = dest.getBaseName();
	var filename = base + "." + outputType;
	dest.setFilename( filename );

	return dest;

};

/**
 * Deletes the destination file in preparation of a PDF render op.
 * The main purpose of this method is to prevent uncatchable write
 * errors during PDF rendering; we want to get ahead of any problems
 * by ensuring the file is ready-to-write before running the PDF op.
 *
 * @param {Dasix.grits.File} file
 * @returns {boolean} TRUE if the destination file is ready to be written;
 *     FALSE if the destination file is not writable.
 */
pr.prepDestination = function( file ) {

	// If the file does not exist then the
	// destination is already "prepped":
	if( !file.exists() ) {
		return true;
	}

	try {

		// Try to remove the file
		fs.unlinkSync( file.getAbsoluteFilePath() );

		// If the unlink did not throw, then the file
		// was removed and is now ready for rewriting
		return true;

	} catch( err ) {

		// Could not unlink, so the file cannot be written
		return false;

	}

};


//<editor-fold desc="+++++ Logging Methods +++++++++++++++++++++++++++">


/**
 * Convenience alias for grits.log()
 *
 * @instance
 * @access protected
 * @param {string} msg
 * @returns {void}
 */
pr.log = function( msg ) {

	var me = this;
	var grits = me.$$grits;
	grits.log( me.pluginName, msg );

};

/**
 * Convenience alias for grits.logObject()
 *
 * @instance
 * @access protected
 * @param {object} obj
 * @returns {void}
 */
pr.logObject = function( obj ) {

	var me = this;
	var grits = me.$$grits;
	grits.logObject( me.pluginName, obj );

};

/**
 * Convenience alias for grits.logError()
 *
 * @instance
 * @access protected
 * @param err
 * @returns {void}
 */
pr.logError = function( err ) {

	var me = this;
	var grits = me.$$grits;
	grits.logError( me.pluginName, err );

};

//</editor-fold>

