/**
 * This script is loaded inside of Phantom.js; it serves as the
 * controller that directs Phantom.js to its work and output.
 */

// Phantom.js built-ins
var system  = require( "system" );
var webpage = require( "webpage" );

// Function for debug messages;
// Using it will cause errors :\
function dbg( msg ) {
	var dbug = true;
	if( dbug === true ) {
		system.stdout.write( "dbg > " + msg );
	}
}

/**
 * Error handler and main exit point.
 *
 * @param {?string|Error} error
 */
function exit ( error ) {

	var message;

	if( !!error ) {

		// Coerce error message
		if( typeof error === "string" ) {
			message = error;
		}

		// Write the error to stderr
		system.stderr.write( "phantom-internal: " + ( message || "Unknown Error " + error ) + "\n" );

		// Exit with code one (failed)
		phantom.exit( 1 );

	} else {

		// Exit with code zero (ok)
		phantom.exit( 0 );

	}

}

// Build stack trace to print
function buildStack ( message, trace ) {

	// First line is the message
	var msgStack = [ message ];

	// Subsequent lines are the stack trace
	if( trace && trace.length ) {
		msgStack.push( "Stack:" );
		trace.forEach(
			function( t ) {
				msgStack.push( "  at " + t.file || t.sourceURL + ": " + t.line + " (in function " + t.function + ")" )
			}
		);
	}

	// Return as a single string
	return msgStack.join( "\n" );

}

/**
 * Internal error handling for Phantom.js
 * @param msg
 * @param trace
 */
phantom.onError = function( msg, trace ) {
	exit( buildStack( "Script: " + msg, trace ) );
};

// Our output handler will pass us configuration info
// as JSON through STDIN.  We read and parse that here..
var json = JSON.parse( system.stdin.readLine() );

// The configuration MUST include a .html property..
if( !json.html || !json.html.trim() ) {
	exit( "Did not receive any html" );
}

// Load additional options
var options = json.options;

// Create a Phantom.js page object
var page = webpage.create();

// Parse: options.httpHeaders
if( options.httpHeaders ) {
	page.customHeaders = options.httpHeaders
}

// Parse: options.viewportSize
if( options.viewportSize ) {
	page.viewportSize = options.viewportSize
}




// ---------------- RESOURCES --------------------------------------------------

var pageResources = {
	req: [],
	rec: [],
	err: []
};

page.onResourceRequested = function( request, rd ) {

	// Store request reference
	pageResources.req.push( request );

	// Update URL to mimic website behavior
	var newUrl = request.url.replace( options.base, options.basePath );
	rd.changeUrl( newUrl );

};
page.onResourceReceived = function(response) {

	// Store response reference
	pageResources.rec.push( response );

};

page.onResourceError = function(resourceError) {

	// Store error reference
	pageResources.err.push( resourceError );

};



// ---------------- RESOURCES --------------------------------------------------



// Starts rendering..
// Parse: options.base
if( options.base ) {
	page.setContent( json.html, options.base );
} else {
	page.setContent( json.html, null );
}

// Page level error handling
page.onError = function( msg, trace ) {
	exit( buildStack( "Evaluation: " + msg, trace ) );
};

// Force cleanup after 2 minutes..
// .. and add 2 seconds to make sure master process triggers
//    kill before to the phantom process.
var timeout = (options.timeout || 120000) + 2000;
setTimeout(
	function() {
		exit( "Force timeout" );
	}, timeout
);

// Completely load page & end process
page.onLoadFinished = function( status ) {

	// The paperSize object must be set at once
	var content = getContent( page );
	page.paperSize = definePaperSize( content, options );

	// Output to parent process
	var fileOptions = {
		type    : options.type || "pdf",
		quality : options.quality || 75
	};

	// Resolve the output filename
	var filename = options.filename || ( options.directory || "/tmp" ) + "/phantom-wrapper-" + system.pid + "." + fileOptions.type;

	// Render the page
	page.render( filename, fileOptions );

	// Return JSON to the output handler
	system.stdout.write( JSON.stringify(
		{
			filename : filename,
			resources: pageResources
			//page: page
			//html: json.html
			//content: content
		}
	));

	// Exit cleanly
	exit( null );

};

/**
 * Returns a hash of the HTML content
 *
 * @param page
 * @returns {Object}
 */
function getContent ( page ) {

	return page.evaluate(

		function cbPageEvaluate() {

			// Helper for getting many elements
			function getElements ( doc, wildcard ) {
				var wildcardMatcher = new RegExp( wildcard + "(.*)" );
				var hasElements     = false;
				var elements        = {};
				var $elements       = document.querySelectorAll( "[id*=\"" + wildcard + "\"]" );

				var $elem, match, i;
				var len = $elements.length;
				for( i = 0; i < len; i++ ) {
					$elem = $elements[ i ];
					match = $elem.attributes.id.value.match( wildcardMatcher );
					if( match ) {
						hasElements            = true;
						elements[ match[ 1 ] ] = $elem.outerHTML;
						$elem.parentNode.removeChild( $elem );
					}
				}

				if( hasElements ) {
					return elements
				}
			}

			// Helper for getting a single element by id
			function getElement ( doc, id ) {
				var $elem = doc.getElementById( id );
				if( $elem ) {
					var html = $elem.outerHTML;
					$elem.parentNode.removeChild( $elem );
					return html;
				}
			}

			// Capture all link and style tags
			var styleTags = document.querySelectorAll( "link,style" );
			styleTags     = Array.prototype.reduce.call(
				styleTags, function( string, node ) {
					return string + node.outerHTML;
				}, ""
			);

			// Wildcard headers
			// e.g. <div id="pageHeader-first"> or <div id="pageHeader-0">
			var allPageHeaders = getElements( document, "pageHeader-" );
			var allPageFooters = getElements( document, "pageFooter-" );

			// Default header and footer e.g. <div id="pageHeader">
			var defaultPageHeader = getElement( document, "pageHeader" );
			var defaultPageFooter = getElement( document, "pageFooter" );

			// Find default header
			if( defaultPageHeader ) {
				allPageHeaders         = allPageHeaders || {};
				allPageHeaders.default = defaultPageHeader;
			}

			// Find default footer
			if( defaultPageFooter ) {
				allPageFooters         = allPageFooters || {};
				allPageFooters.default = defaultPageFooter;
			}

			// Capture the document body
			var bodyElement = document.getElementById( "pageContent" );
			var bodyHtml;

			// Extract the HTML
			if( bodyElement ) {
				bodyHtml = bodyElement.outerHTML;
			} else {
				bodyHtml = document.body.outerHTML;
			}

			// Finished..
			return {
				styles : styleTags,
				header : allPageHeaders,
				body   : bodyHtml,
				footer : allPageFooters
			};

		}

	)

}

/**
 * Creates a page section
 * This function is called exclusively by: definePaperSize()
 *
 * @param {object} section
 * @param {object} content
 * @param {object} options
 * @returns {object}
 */
function __createSection ( section, content, options ) {

	var c = content[ section ] || {};
	var o = options[ section ] || {};

	function phantomCallback( pageNum, numPages ) {
		var html = c[ pageNum ];
		if( pageNum === 1 && !html ) {
			html = c.first;
		}
		if( pageNum === numPages && !html ) {
			html = c.last;
		}
		return (html || c.default || o.contents || "")
				.replace( "{{page}}", pageNum )
				.replace( "{{pages}}", numPages ) + content.styles;
	}

	return {
		height   : o.height,
		contents : phantom.callback( phantomCallback )
	};

}

/**
 * Create paper with specified options..
 * This function is called exclusively by: definePaperSize()
 *
 * @param {object} options
 * @returns {object}
 */
function __definePaperOrientation ( options ) {

	// Init return
	var paper = {
		border : options.border || "0"
	};

	if( options.height && options.width ) {

		// If H/W is provided, use those..
		paper.width  = options.width;
		paper.height = options.height;

	} else {

		// Otherwise use format and orientation
		paper.format      = options.format || "A4";
		paper.orientation = options.orientation || "portrait";

	}

	// All done
	return paper;

}

/**
 * Creates paper with generated footer & header
 *
 * @param content
 * @param options
 * @returns {Object}
 */
function definePaperSize ( content, options ) {

	var paper = __definePaperOrientation( options );

	if( options.header || content.header ) {
		paper.header = __createSection( "header", content, options );
	}

	if( options.footer || content.footer ) {
		paper.footer = __createSection( "footer", content, options );
	}

	if( paper.header && paper.header.height === undefined ) {
		paper.header.height = "46mm";
	}
	if( paper.footer && paper.footer.height === undefined ) {
		paper.footer.height = "28mm";
	}

	return paper;

}
