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

p.attachToModule = function( module ) {

	var me = this;
	module.logger = me;
	module.log = me.log.bind( me );
	module.logObject = me.logObject.bind( me );

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

p.logObject = function( obj ) {

	var me = this;

	for (var key in obj) {
		if (obj.hasOwnProperty(key)) {

			var val = obj[ key ];
			me.log("[" + key + "] <" + (typeof val) + "> :" + val );

		}
	}

};
