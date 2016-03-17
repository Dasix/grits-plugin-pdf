/**
 * Entry point for PhantomJS wrapper.
 *
 * @type {object}
 */

// Dependencies
var tipe 	= require( "tipe" );
var hModule = require( "./output-handler" );

module.exports = {

	create : function createPdf ( html, options, callback ) {

		// signature: ( html )
		if( arguments.length === 1 ) {
			options 	= {};
			callback 	= null;
		}

		// signature: ( html, options )
		if( arguments.length === 2 ) {
			if( typeof options !== "function" ) {

				// signature: ( html, options )
				callback 	= null;

			} else {

				// signature: ( html, callback )
				callback 	= options;
				options  	= {};

			}
		}

		// create the output handler object
		try {
			var hObj    = new hModule( html, options );
		} catch( err ) {
			if( callback !== null ) {
				return callback( err );
			} else {
				throw err;
			}
		}

		// If we do not have a proper callback,
		// then we will not call .exec
		if( callback !== null && callback !== undefined ) {
			hObj.exec( callback );
		}

		// Finished
		return hObj;


	}

};
