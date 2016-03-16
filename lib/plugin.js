var _ = require("lodash");
var tipe = require("tipe");
var Promise = require("bluebird");
var pth = require("path");

/**
 * @constructor
 */
var pl = module.exports = function( renderer ) {

	// Locals
	var me = this;

	// Set the plugin name (which is REQUIRED for all plugins)
	me.pluginName = "grits-plugin-pdf";

};

// For convenience
var pr = pl.prototype;

/**
 * The Grits renderer will call this method once when it
 * first loads the plugin.
 *
 * @param {Dasix.grits.Renderer} renderer The Grits renderer object.
 * @returns {void}
 */
pr.onAttach = function( renderer ) {

	var me = this;

};
