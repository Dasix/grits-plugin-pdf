/**
 * This is the main Phantom.js wrapper class.  It tells Phantom.js to load a
 * page and then captures the output and returns it in various forms.
 *
 * Notes:
 * - Originally from:
 * https://github.com/marcbachmann/node-html-pdf/blob/master/lib/pdf.js
 * - phantomjs version 1.8.1 and later should work.
 *
 * Regions for the input page are:
 * - Page Header  -> document.getElementById("pageHeader")
 * - Page Content -> document.getElementById("pageContent")
 * - Page Footer  -> document.getElementById("pageFooter")
 *
 * _When no #pageContent is available, phantomjs will use document.body as the
 * input page content_
 */

var fs           = require( "fs" );
var childprocess = require( "child_process" );
var path         = require( "path" );
var assert       = require( "assert" );
var _			 = require( "lodash" );

// Allows custom Phantom.js installs
try {
	var phantomjs = require( "phantomjs-prebuilt" )
} catch( err ) {
	console.log( "phantom-wrapper: Failed to load PhantomJS module.", err )
}

/**
 * @constructor
 * @type {module.exports}
 */
var OutputHandler = module.exports = function( html, options ) {

	// Locals
	var me = this;

	// Save the HTML to 'this'
	me.html    = html;

	// Default: options param (and save to 'this')
	me.options = options || {};

	// Default: options.type
	if( options.type === undefined ) {
		options.type = "pdf";
	}

	// Parse: options.script
	if( me.options.script ) {
		me.script = path.normalize( me.options.script );
	} else {
		me.script = path.join( __dirname, "scripts", "controller-main.js" );
	}

	// Parse: options.filename
	if( me.options.filename ) {
		me.options.filename = path.resolve( me.options.filename );
	}

	// Parse: options.phantomPath
	if( !me.options.phantomPath ) {
		me.options.phantomPath = phantomjs && phantomjs.path;
	}

	// Default: options.phantomArgs
	me.options.phantomArgs = me.options.phantomArgs || [];

	// Handle: options.logFn
	if( options.logFn !== undefined ) {
		me.$$logFn = options.logFn;
	} else {
		me.$$logFn = null;
	}

	// Assertions
	assert( me.options.phantomPath, "phantom-wrapper: Failed to load PhantomJS module. You have to set the path to the PhantomJS binary using 'options.phantomPath'" );
	assert( typeof me.html === "string" && me.html.length, "phantom-wrapper: Can't run Phantom.js without an html string" );

	// Parse: options.timeout
	me.options.timeout = parseInt( me.options.timeout ) || 30000;

};

// For convenience
var prto = OutputHandler.prototype;

/**
 * This method automates the loading of the data into a Buffer after
 * Phantom.js has written its output to a file.  Once the file has been read
 * into the Buffer, it will be deleted.
 *
 * @param {function} callback ( {Error|null}, {Buffer} )
 * @returns {void}
 */
prto.toBuffer = function OutputHandlerToBuffer ( callback ) {

	// Locals
	var me = this;

	// Create a callback wrapper function
	function bufferCallbackWrapper ( err, res ) {
		if( err ) {
			return callback( err );
		}

		// Read the file
		fs.readFile( res.filename, function readCallback ( err, buffer ) {

			// Handle errors
			if( err ) {
				return callback( err );
			}

			// Delete the temporary Phantom.js output file
			fs.unlink( res.filename, function unlinkOutputHandlerFile ( err ) {

				// Handle errors..
				if( err ) {
					return callback( err );
				}

				// All is good, return our buffer
				callback( null, buffer );

			});

		});

	}

	// Defer to exec()
	me.exec( bufferCallbackWrapper );

};

/**
 * This method automates the creation of a stream after Phantom.js has written
 * its output to a file.  Once the stream closes the file is deleted.
 *
 * @param {function} callback ( {Error|null}, {readableStream} )
 * @returns {void}
 */
prto.toStream = function OutputHandlerToStream ( callback ) {

	var me = this;

	// Create a wrapper function for the exec() callback
	function streamCallbackWrapper( err, res ) {

		// Handle errors
		if( !!err ) {
			return callback( err );
		}

		// Create a stream
		try {
			var stream = fs.createReadStream( res.filename );
		} catch( err ) {
			return callback( err )
		}

		// Whenever the stream ends (i.e. is closed), we will
		// delete the temporary file created by Phantom.js
		stream.on( "end", function() {
			fs.unlink( res.filename, function( err ) {
				if( !!err ) {
					throw err;
				}
			});
		});

		// All is good, return our stream
		callback( null, stream );

	}

	// Defer to exec()
	me.exec( streamCallbackWrapper );

};

/**
 * Directs Phantom.js output to a file.  Phantom.js is going to do
 * this anyway, all of the other 'to' methods just automatically
 * read the output file and delete it after they're finished.
 * Thus, this method really just prevents automatic deletion
 * of the Phantom.js output file and, optionally, allows you to
 * set the path for that output.
 *
 * @param {?string} [filename] If this is not provided, Phantom.js will output
 * to a randomly generated cache file.
 * @param {function} callback ( {object} )
 * @returns {void}
 */
prto.toFile = function OutputHandlerToFile ( filename, callback ) {

	// Locals
	var me = this;

	// Require valid signature
	assert( arguments.length > 0, "phantom-wrapper: The method .toFile( [filename, ] callback ) requires a callback function." );

	// Determine method signature
	if( filename instanceof Function ) {

		// Signature: ( callback )
		callback = filename;
		filename = undefined;

	} else {

		// Signature: ( filename, callback )
		me.options.filename = path.resolve( filename );

	}

	// Defer to exec()
	me.exec( callback );

};

/**
 * Executes PhantomJS
 *
 * @param {function} callback
 * @returns {*}
 */
prto.exec = function OutputHandlerExec ( callback ) {

	// Locals
	var me     = this;
	var stdoutCache = [];
	var stderrCache = [];

	// Spawn the Phantom.js child process
	var child   = childprocess.spawn( me.options.phantomPath, [].concat( me.options.phantomArgs, [ me.script ] ) );

	// Wait for a predetermined time before terminating
	// Phantom.js (to allow all assets to load)
	var timeout = setTimeout(
		function onPhantomTimeout() {

			// End STDIN input
			child.stdin.end();

			// Kill phantom
			child.kill();

			// Expect STDERR output from phantom (??)
			if( !stderrCache.length ) {
				stderrCache = [ new Buffer( "phantom-wrapper: Phantom.js output generation timeout. Phantom.js script did not exit as expected." ) ];
			}

		}, me.options.timeout
	);

	// Handle data coming from Phantom.js via STDIN
	child.stdout.on( "data", function( buffer ) {

		// Store data in STDOUT cache array

		var str = buffer.toString("utf8");
		if( str.substr(0,6) === "[json:" ) {
			me._onPhantomMessage( str );
		} else {
			return stdoutCache.push( buffer );
		}

	});

	// Handle errors coming from Phantom.js via STDERR
	child.stderr.on("data", function( buffer ) {

		// Store error in STDERR cache array
		stderrCache.push( buffer );

		// End STDIN input
		child.stdin.end();

		// Kill Phantom.js
		return child.kill();

	});

	// Handle child process self-termination
	child.on( "exit", function( code ) {

		// No point in waiting for a timeout
		clearTimeout( timeout );

		// Check for errors..
		if( code || stderrCache.length ) {

			// Create a new error object with the message from Phantom.js
			var err = new Error( Buffer.concat( stderrCache ).toString() || "phantom-wrapper: Unknown Error" );

			// Callback with error
			return callback( err );

		} else {

			// No errors from Phantom.js, we expect Phantom to
			// respond with a string of JSON data.

			try {

				// Convert output to a string
				var buff = Buffer.concat( stdoutCache ).toString();

				// Clean the output a bit..
				var data = (buff) != null ? buff.trim() : undefined;

				// Parse the JSON
				data     = JSON.parse( data );

			} catch( err ) {


				var errMessage = "Phantom Data Parsing Failed: " + err.message;

				if( me.options.filename !== undefined && me.options.filename !== null ) {
					errMessage = errMessage + "\n  -> In: '" + me.options.filename + "'"
				}

				var er2 = new Error( errMessage );

				// Handle output parsing errors
				return callback( er2 );

			}

			// Callback with the final data
			return callback( null, data );

		}
	});

	// Create JSON settings string
	var res = JSON.stringify({
		html 	: me.html,
		options : me.options
	});

	// Push JSON to Phantom.js child process
	return child.stdin.write( res + "\n", "utf8" );

};

prto._onPhantomMessage = function( rawStr ) {

	// Locals
	var me         = this;

	// Ignore empty strings
	if( rawStr.replace(/\s/, "") === "" ) {
		return;
	}

	// Break newlines
	if( rawStr.indexOf("\n") !== -1 ) {
		_.each( rawStr.split("\n"), function( line ) {
			me._onPhantomMessage( line );
		});
		return;
	}

	// Break apart message
	var bracketLoc = rawStr.indexOf( "]" );
	var topic      = rawStr.substr( 6, ( bracketLoc - 6 ) );
	var str        = rawStr.substr( ( bracketLoc + 2 ) );
	var obj        = JSON.parse( str );
	//obj.topic = topic;

	if( obj.msg !== undefined && obj.msg !== null ) {
		me.log("[PhantomJS] " + topic + ": " + obj.msg);
	}

};

prto.log = function( msg ) {

	var me = this;
	if( me.$$logFn !== null ) {
		me.$$logFn( msg );
	}

};
