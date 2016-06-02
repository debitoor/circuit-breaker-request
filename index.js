var request = require('request');
var rrs = require('request-retry-stream');
var levee = require('levee');
var getGroupId = require('./getGroupId');

var cnf;
try {
	cnf = require('cnf').circuitBreakerRequest || {};
} catch (ex) {
	cnf = {};
}

module.exports = defaults(cnf);
module.exports.defaults = defaults;

var groups = {};

function cbr() {
	var params = request.initParams.apply(request, arguments);
	params = Object.assign({
		timeout: 25000,
		maxFailures: 5,
		resetTimeout: 30000,
		attempts: 3,
		getGroupId
	}, params);
	params.requestTimeout = params.requestTimeout || Math.floor(params.timeout / params.attempts);
	var groupId = params.getGroupId(params.url || params.uri);
	groups[groupId] = groups[groupId] || levee.createBreaker(rrs, params);

	var rrsParams = Object.assign({}, params);
	rrsParams.timeout = params.requestTimeout;
	delete rrsParams.requestTimeout;
	rrsParams.circuitBreakerTimeout = params.timeout;

	if (typeof rrsParams.callback === 'function') {
		var originalCallback = rrsParams.callback;
		rrsParams.callback = function (err) {
			if (err && err.code === 1000) {
				Object.assign(err, rrsParams);
				err.message = 'Circuit breaker is closed, will open once errors stop happening';
			}
			originalCallback.apply(this, arguments);
		};
	}

	return groups[groupId].run(rrsParams, rrsParams.callback);
}

function defaults(defaultOpts) {
	var d = fn();
	d.get = fn('get');
	d.head = fn('head');
	d.post = fn('post');
	d.put = fn('put');
	d.patch = fn('patch');
	d.del = fn('del');
	return d;

	function fn(verb) {
		return function () {
			var params = request.initParams.apply(request, arguments);
			if (verb) {
				params.method = verb === 'del' ? 'DELETE' : verb.toUpperCase();
			}
			return cbr(Object.assign({}, defaultOpts, params), verb);
		};
	}
}
