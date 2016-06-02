var express = require('express');
var app = express();
var responses = [];
var cbr = require('../..').defaults({
	url: 'http://localhost:4340/test',
	timeout: 2000,
	json: true,
	logFunction: console.warn
});

describe('circuit-breaker-request GET callbacks, with defaults', function () {
	before(function () {


		app.disable('x-powered-by');
		app.get('/test', function (req, res, next) {
			if (!responses.length) {
				throw new Error('no responses specified for test');
			}
			var responseToSend = responses.shift();
			if (responseToSend.timeout) {
				return null;
			}
			var buf = new Buffer(responseToSend.msg, 'utf-8');
			res.writeHeader(responseToSend.statusCode, {
				'content-type': 'application/json',
				'content-length': buf.length
			});
			return sendByte();

			function sendByte() {
				if (!buf.length) {
					return res.end();
				}
				res.write(new Buffer([buf.readUInt8(0)]));
				buf = buf.slice(1);
				process.nextTick(sendByte);
			}
		});

		app.use(function (err, req, res, next) {
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4340, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function get(r, callback) {
		responses = r;
		result = {};
		cbr.get({}, function (err, resp) {
			result.statusCode = resp && resp.statusCode;
			result.headers = resp && resp.headers;
			result.body = resp && resp.body;
			result.err = err;
			callback();
		});
	}

	describe('returning success', function () {
		before(done => get([{statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({
				body: 'success',
				statusCode: 200,
				headers: {'content-type': 'application/json'}
			});
		});
	});
});
