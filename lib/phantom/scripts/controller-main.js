/**
 * This script is loaded inside of Phantom.js; it serves as the
 * controller that directs Phantom.js to its work and output.
 */

// Phantom.js built-ins
var system  = require( "system" );
var webpage = require( "webpage" );

// Other deps
var mLogger   = require( "./lib/logger.js" );
var mResource = require( "./lib/resources.js" );

// Create the logger
var logger = new mLogger();

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

/*
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
*/



// ---------------- RESOURCES --------------------------------------------------

/*
function sendToHandler( topic, obj ) {
	system.stdout.write( "[json:" + topic + "] " + JSON.stringify(obj) + "\n" );
}

page.onConsoleMessage = function(msg, lineNum, sourceId) {
	sendToHandler( "console",
		{
			msg		: msg,
			lineNum	: lineNum,
			sourceId: sourceId,
			from	: "page.onConsoleMessage"
		}
	);
};

console.log = function( msg ) {
	sendToHandler( "console",
		{
			msg		: msg,
			lineNum	: null,
			sourceId: null,
			from	: "console.log"
		}
	);
};
*/

// Create the resourceManager
var resourceManager = new mResource( options, logger );
resourceManager.attachToPage( page );

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

function setPaperSize() {
	// The paperSize object must be set at once
	var content = getContent( page );
	page.paperSize = __definePaperSize( content, options );
}


// Completely load page & end process
page.onLoadFinished = function( status ) {

	// Set the paper size
	setPaperSize();

	// Output to parent process
	var fileOptions = {
		type    : options.type || "pdf",
		quality : options.quality || 75
	};

	// Resolve the output filename
	var filename = options.filename || ( options.directory || "/tmp" ) + "/phantom-wrapper-" + system.pid + "." + fileOptions.type;

	resourceManager.waitForResources( function() {

		// Render the page
		page.render( filename, fileOptions );

		// Return JSON to the output handler
		system.stdout.write( JSON.stringify(
			{
				filename : filename,
				resources: resourceManager.resources
				//page: page
				//html: json.html
				//content: content
			}
		));

		// Exit cleanly
		exit( null );

	});


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

			// Revert to document.body if #pageContent does not exist
			if( !bodyElement ) {
				bodyElement = document.body;
			}

			// Add a special class for the body element
			bodyElement.className += " phantom-body-element";

			// Extract the HTML
			bodyHtml = bodyElement.outerHTML;

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
		var ret;

		if( pageNum === 1 && !html ) {
			html = c.first;
		}
		if( pageNum === numPages && !html ) {
			html = c.last;
		}

		// Resolve HTML
		ret = (html || c.default || o.contents || "");
		ret = ret.replace( ":page:", pageNum );
		ret = ret.replace( ":pages:", numPages );

		ret = replaceClassWithStyle(ret);

		// Return
		return ret;

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
function __definePaperSize ( content, options ) {

	var paper = __definePaperOrientation( options );

	if( options.header || content.header ) {
		paper.header = __createSection( "header", content, options );
	}

	if( options.footer || content.footer ) {
		paper.footer = __createSection( "footer", content, options );
	}

	if( paper.header && paper.header.height === undefined ) {
		if( options.defaultHeaderHeight ) {
			paper.header.height = options.defaultHeaderHeight;
		} else {
			paper.header.height = "30mm";
		}
	}
	if( paper.footer && paper.footer.height === undefined ) {
		if( options.defaultFooterHeight ) {
			paper.footer.height = options.defaultFooterHeight;
		} else {
			paper.footer.height = "20mm";
		}
	}

	return paper;

}

/**
 * This function "will take a piece of html, create a temporary element in the
 * body with the html, compute the style for each element with a class, add the
 * computed style inline and return the new html."
 * - from: http://stackoverflow.com/questions/17502677/phantomjs-dosent-render-footers-with-a-custom-styles/27296129#27296129
 *
 * @param html
 * @returns {Object}
 */
function replaceClassWithStyle(html) {
	return page.evaluate(function(html) {
		var host = document.createElement('div');
		host.setAttribute('style', 'display:none;'); // Silly hack, or PhantomJS will 'blank' the main document for some reason
		host.innerHTML = html;

		// Append to get styling of parent page
		document.body.appendChild(host); // if not appended, values will be blank

		var elements = host.getElementsByTagName('*');
		// Iterate in reverse order (depth first) so that styles do not impact eachother
		for (var i = elements.length - 1; i >= 0; i--) {

			// My changes: Added code to remove 'display: none' from elements,
			// this allows header/footer elements to be hidden from normal web
			// and print but visible to PhantomJS only..
			var computed = window.getComputedStyle(elements[i], null);
			var strComputed = computed.cssText;
			var disp = computed.getPropertyValue("display");
			if( disp === "none" ) {
				strComputed = strComputed.replace("display: none", "display: block");
			}
			elements[i].setAttribute('style', strComputed);
			// - end of my changes -

		}

		// Remove from parent page again, so we're clean
		document.body.removeChild(host);
		return host.innerHTML;

	}, html);
}

