// Deps
//var system = require("system");

// Constructor
var c = module.exports = function( page, options, logger ) {

	// Locals
	var me = this;

	// Store the options
	me.options = options;

	// Init log methods
	logger.attachToModule( me );

	// Store the page ref
	me.page = page;

};

// For convenience
var p = c.prototype;

/**
 * Finds the 'base' url in a string and replaces all occurences
 * with the 'baseUrl' setting.
 */
p.translateUrls = function( str ) {

	// Locals
	var me 			= this;
	var opts 		= me.options;

	// Exit early if we have insufficient settings
	if( opts.base === undefined || opts.basePath === undefined ) {
		return str;
	}

	// More locals
	var repl		= opts.base;
	var regx		= new RegExp( repl, "ig" );
	var replWith 	= opts.basePath;
	var translatedStr;

	// Exit early if the string does not
	// contain the search string
	if( str.indexOf( repl ) === -1 ) {
		return str;
	}

	// Perform the replace op
	translatedStr = str.replace( regx, replWith );

	// Log/Debug
	me.log("~~~~~~~~~~~~~~~~~~");
	me.log("Translated:");
	me.log(str);
	me.log("-to-");
	me.log(translatedStr);
	me.log("~~~~~~~~~~~~~~~~~~");

	// Complete
	return translatedStr;

};

/**
 * This function "will take a piece of html, create a temporary element in the
 * body with the html, compute the style for each element with a class, add the
 * computed style inline and return the new html."
 * - from: http://stackoverflow.com/questions/17502677/phantomjs-dosent-render-footers-with-a-custom-styles/27296129#27296129
 *
 * @param html
 * @returns {Object}
 */
p.replaceClassWithStyle = function( html ) {

	var me = this;

	//var appendStr = "<img src=\"file:///project/test/fixtures/basic/output/images/tmp-logoA.png\" width=\"30\" height=\"30\" class=\"pjs-no-rcws\">";
	//var appendStr = "meeeeeeex";

	//html = me.appendToOuterDiv( html, appendStr );
	//me.log(html);


	var evalResult = me.page.evaluate( function( html ) {

		var host = document.createElement('div');
		host.setAttribute('style', 'display:none;'); // Silly hack, or PhantomJS will 'blank' the main document for some reason
		host.innerHTML = html;

		// Append to get styling of parent page
		document.body.appendChild(host); // if not appended, values will be blank

		var elements = host.getElementsByTagName('*');
		// Iterate in reverse order (depth first) so that styles do not impact eachother
		for (var i = elements.length - 1; i >= 0; i--) {

			if( elements[i].className.indexOf("pjs-no-rcws") === -1 ) {
				var computed = window.getComputedStyle(elements[i], null);
				var strComputed = computed.cssText;
				var disp = computed.getPropertyValue("display");
				if( disp === "none" ) {
					strComputed = strComputed.replace("display: none", "display: block");
				}
				elements[i].setAttribute('style', strComputed);
			}

		}

		// Remove from parent page again, so we're clean
		document.body.removeChild(host);
		return host.innerHTML;

	}, html );

	// -

	//evalResult = me.appendToOuterDiv( evalResult, appendStr );

	// -

	//<img src="file:///project/test/fixtures/basic/output/images/tmp-logoA.png" width="30" height="30">

	//me.logger.logObject( me.options );
	//evalResult = me.translateUrls( evalResult );

	//me.log( evalResult.replace(/\s/ig, '') );

	return evalResult;

};

p.appendToOuterDiv = function( html, appendStr ) {

	return html.replace(/\<\/div\>\s*$/, appendStr + "</div>");

};
