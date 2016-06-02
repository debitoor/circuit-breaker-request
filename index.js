var request = require('request');
var rrs = require('request-retry-stream');
var levee = require('levee');

var getGroupId = require('./getGroupId');
var cnf;
try {
	cnf = require('cnf').circuitBreakerRequest;
} catch (ex) {
	cnf = {};
}

module.exports = defaults(cnf);

var circuitBreakerGroups = {};

function cbr() {
	var params = request.initParams.apply(request, arguments);
	params.timeout = params.timeout || 25000;
	params.maxFailures = params.maxFailures || 5;
	params.resetTimeout = params.resetTimeout || 30000;
	params.attempts = params.attempts || 3;
	params.requestTimeout = params.requestTimeout || Math.floor(params.timeout/params.attempts);
	params.getGroupId = params.getGroupId || getGroupId;
	var groupId = params.getGroupId(params.url || params.uri);
	var circuitBreaker = circuitBreakerGroups[groupId];
	if(!circuitBreaker){
		circuitBreaker = circuitBreakerGroups[groupId] = levee.createBreaker(rrs, params);
	}
	var rrsParams = Object.assign({}, params);
	rrsParams.timeout = params.requestTimeout;
	delete rrsParams.requestTimeout;
	rrsParams.circuitBreakerTimeout = params.timeout;
	return circuitBreaker.run(rrsParams, rrsParams.callback);
}

module.exports.defaults = defaults;

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
			return cbr(Object.assign(Object.assign({}, defaultOpts), params), verb);
		};
	}
}
