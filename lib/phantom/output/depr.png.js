/*
 * phantomjs version 1.8.1 and later should work.
 *
 * Create a PNG file out of an html string.
 *
 * Regions for the PNG page are:
 *
 * - Page Header  -> document.getElementById('pageHeader')
 * - Page Content -> document.getElementById('pageContent')
 * - Page Footer  -> document.getElementById('pageFooter')
 *
 * When no #pageContent is available, phantomjs will use document.body as png content
 */
module.exports = PNG;
function PNG (html, options) {

	this.html = html;
	this.options = options || {};

	if (this.options.script) {
		this.script = path.normalize(this.options.script);
	} else {
		this.script = path.join( __dirname, 'scripts', 'png_a4_portrait.js' );
	}

	if (this.options.filename) this.options.filename = path.resolve(this.options.filename);
	if (!this.options.phantomPath) this.options.phantomPath = phantomjs && phantomjs.path;
	this.options.phantomArgs = this.options.phantomArgs || [];
	assert(this.options.phantomPath, "html-png: Failed to load PhantomJS module. You have to set the path to the PhantomJS binary using 'options.phantomPath'");
	assert(typeof this.html === 'string' && this.html.length, "html-png: Can't create a png without an html string");
	this.options.timeout = parseInt(this.options.timeout) || 30000;
}

PNG.prototype.toBuffer = function PngToBuffer (callback) {
	this.exec(function execPngToBuffer (err, res) {
		if (err) return callback(err);
		fs.readFile(res.filename, function readCallback (err, buffer) {
			if (err) return callback(err);
			fs.unlink(res.filename, function unlinkPngFile (err) {
				if (err) return callback(err);
				callback(null, buffer);
			})
		})
	})
};

PNG.prototype.toStream = function PngToStream (callback) {
	this.exec(function (err, res) {
		if (err) return callback(err);
		try {
			var stream = fs.createReadStream(res.filename);
		} catch (err) {
			return callback(err);
		}

		stream.on('end', function () {
			fs.unlink(res.filename, function (err) {
				if (err) console.log('html-png:', err);
			});
		});

		callback(null, stream);
	})
};

PNG.prototype.toFile = function PngToFile (filename, callback) {
	assert(arguments.length > 0, 'html-png: The method .toFile([filename, ]callback) requires a callback.');
	if (filename instanceof Function) {
		callback = filename;
		filename = undefined;
	} else {
		this.options.filename = path.resolve(filename);
	}
	this.exec(callback)
};

PNG.prototype.exec = function PngExec (callback) {
	var child = childprocess.spawn(this.options.phantomPath, [].concat(this.options.phantomArgs, [this.script]));
	var stdout = [];
	var stderr = [];
	var timeout = setTimeout(function execTimeout () {
		child.stdin.end();
		child.kill();
		if (!stderr.length) {
			stderr = [new Buffer('html-png: PNG generation timeout. Phantom.js script did not exit.')]
		}
	}, this.options.timeout);

	child.stdout.on('data', function (buffer) {
		return stdout.push(buffer)
	});

	child.stderr.on('data', function (buffer) {
		stderr.push(buffer);
		child.stdin.end();
		return child.kill();
	});

	child.on('exit', function (code) {
		clearTimeout(timeout);
		if (code || stderr.length) {
			var err = new Error(Buffer.concat(stderr).toString() || 'html-png: Unknown Error');
			return callback(err)
		} else {
			try {
				var buff = Buffer.concat(stdout).toString();
				var data = (buff) != null ? buff.trim() : undefined;
				data = JSON.parse(data)
			} catch (err) {
				return callback(err)
			}
			return callback(null, data)
		}
	});

	var res = JSON.stringify({html: this.html, options: this.options});
	return child.stdin.write(res + '\n', 'utf8');
};
