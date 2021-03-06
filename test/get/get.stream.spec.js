var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var cbr = require('../..');

describe('circuit-breaker-request GET stream', function () {
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

		var server = app.listen(4300, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function get(r, callback) {
		responses = r;
		result = {};
		var stream;
		stream = cbr.get({
			url: 'http://localhost:4300/test',
			timeout: 3000,
			logFunction: console.warn
		});
		stream.on('response', function (resp) {
			result.statusCode = resp.statusCode;
			result.headers = resp.headers;
		});
		var concatStream = concat(function (body) {
			result.body = JSON.parse(body.toString());
		});
		pump(stream, concatStream, function (err) {
			if (err) {
				result.err = Object.assign({stack: err.stack}, err);
			}
			callback && callback();
		});
		return {req: stream, dest: concatStream};
	}


	describe('returning 503 and then success', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and then success', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
			statusCode: 200,
			msg: '"success"'
		}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and 503', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
			statusCode: 503,
			msg: 'err'
		}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 3,
					body: 'err',
					method: 'GET',
					statusCode: 503,
					url: 'http://localhost:4300/test'
				}
			});
		});
	});

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

	describe('returning 400', function () {
		before(done => get([{statusCode: 400, msg: 'err'}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 1,
					body: 'err',
					method: 'GET',
					statusCode: 400,
					url: 'http://localhost:4300/test'
				}
			});
		});
	});

	describe('returning 503 then 400', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 400, msg: 'err'}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 2,
					body: 'err',
					method: 'GET',
					statusCode: 400,
					url: 'http://localhost:4300/test'
				}
			});
		});
	});

	describe('timing out then 200', function () {
		before(done => get([{timeout: true}, {statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('pipefilter', function () {
		var req, dest;
		before(done => {
			req = get([{statusCode: 200, msg: '"success"'}]);
			req.req.pipefilter = function (r, d) {
				dest = d;
				done();
			};
		});

		it('calls pipefilter with correct dest', ()=> {
			expect(dest).to.eql(req.dest);
		});
		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 400 6 times', function () {
		for (var i = 0; i < 6; i++) {
			before(done => get([{statusCode: 400, msg:'"err"'}], done));
		}

		it('calls with err that circuit breaker is closed', ()=> {
			expect(result).to.containSubset({
				err: {
					args: [
						{
							attempts: 3,
							circuitBreakerTimeout: 3000,
							maxFailures: 5,
							method: 'GET',
							resetTimeout: 30000,
							timeout: 1000,
							url: 'http://localhost:4300/test'
						}
					],
					code: 1000
				}
			});
		});
	});

});
