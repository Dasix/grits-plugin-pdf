// Deps
var system = require("system");

// Constructor
var c = module.exports = function() {};

// For convenience
var p = c.prototype;

p.sendToHandler = function( topic, obj ) {
	system.stdout.write( "[json:" + topic + "] " + JSON.stringify(obj) + "\n" );
};

p.attachToPage = function( page ) {

	var me = this;
	page.onConsoleMessage = function( msg, lineNum, sourceId ) {
		me.sendToHandler( "console",
			{
				msg		: msg,
				lineNum	: lineNum,
				sourceId: sourceId,
				from	: "page.onConsoleMessage"
			}
		);
	};

};

p.log = function( msg ) {

	var me = this;
	me.sendToHandler( "console",
		{
			msg		: msg,
			lineNum	: null,
			sourceId: null,
			from	: "console.log"
		}
	);
};
