var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var cbr = require('../..');

describe('circuit-breaker-request DELETE callbacks', function () {

	before(function () {
		app.disable('x-powered-by');
		app.delete('/test', function (req, res, next) {
			if (!responses.length) {
				throw new Error('no responses specified for test');
			}
			var responseToSend = responses.shift();
			if (responseToSend.timeout) {
				return null;
			}
			pump(req, concat(sendResponse), function (err) {
				if (err) {
					return next(err);
				}
			});
			function sendResponse(buf) {
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
			}
		});

		app.use(function (err, req, res, next) {
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4320, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function del(msg, r, callback) {
		responses = r;
		result = {};
		cbr.del({
			url: 'http://localhost:4320/test',
			timeout: 2000,
			json: true,
			body: msg,
			logFunction: console.warn
		}, function (err, resp) {
			result.statusCode = resp && resp.statusCode;
			result.headers = resp && resp.headers;
			result.body = resp && resp.body;
			result.err = err;
			callback();
		});
	}

	describe('returning success', function () {
		before(done => del('success', [{statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({
				body: 'success',
				statusCode: 200,
				headers: {'content-type': 'application/json'}
			});
		});
	});

	describe('returning 503 and then success', function () {
		before(done => del('success', [{statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and then success', function () {
		before(done => del('success', [{statusCode: 503}, {statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and 503', function () {
		before(done => del('err', [{statusCode: 503}, {statusCode: 503}, {statusCode: 503}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 3,
					body: 'err',
					method: 'DELETE',
					statusCode: 503,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('returning 400', function () {
		before(done => del('err', [{statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 1,
					body: 'err',
					method: 'DELETE',
					statusCode: 400,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('returning 503 then 400', function () {
		before(done => del('err', [{statusCode: 503}, {statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 2,
					body: 'err',
					method: 'DELETE',
					statusCode: 400,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('timing out then 200', function () {
		this.timeout(5000);
		before(done => del('success', [{timeout: true}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('timing out 3 times then 200', function () {
		this.timeout(15000);
		before(done => del('success', [{timeout: true}, {timeout: true}, {timeout: true}, {statusCode: 200}], done));

		it('calls with command timeout from circuit breaker', ()=> {
			expect(result).to.have.property('err').to.containSubset({
				message: 'Circuit breaker timed out',
				code: 1100,
				args: [{
					timeout: 666,
					maxFailures: 5,
					resetTimeout: 30000,
					attempts: 3,
					url: 'http://localhost:4320/test',
					json: true,
					body: 'success',
					method: 'DELETE',
					circuitBreakerTimeout: 2000
				}]
			});
		});
	});

	describe('returning 400 6 times', function () {
		for (var i = 0; i < 6; i++) {
			before(done => del('err', [{statusCode: 400}], done));
		}

		it('calls with err that circuit breaker is closed', ()=> {
			expect(result).to.have.property('err').to.containSubset({
				message: 'Circuit breaker forced failure. It will stop forcing failures once calls start succeeding',
				code: 1000,
				args: [{
					attempts: 3,
					circuitBreakerTimeout: 2000,
					url: 'http://localhost:4320/test',
					json: true,
					resetTimeout: 30000,
					timeout: 666,
					maxFailures: 5,
					method: 'DELETE',
					body: 'err'
				}]
			});
		});
	});
});
