# circuit-breaker-request

A wrapper around [request-retry-stream](https://github.com/debitoor/request-retry-stream#readme), that itself wraps
 [request](https://github.com/request/request#readme).

 cuircuit-breaker-request Implements a circuit breaker using the
 [levee](https://github.com/krakenjs/levee#readme) module.

 For more information about circuit breaking read the
 [akka docs on the circuit breaker pattern](http://doc.akka.io/docs/akka/snapshot/common/circuitbreaker.html)

	npm install circuit-breaker-request

## Usage - Basic with callbacks

```js

var cbr = require('circuit-breaker-request');

cbr.get('https://google.com', function(err, resp){
	// handle err and resp. Any response that does not have http status code 2XX is an error here
});
```

## Usage - Simple stream in express middleware with pump (piping streams)

```js
var cbr = require('circuit-breaker-request');
var pump = require('pump');

function(req, res, next){
    pump(cbr.get('http://google.com', {timeout: 5000}), res, next);
}
```


## Usage - Options and defaults
```javascript

// NOTE: all options are OPTIONAL.
// Defaults, displayed in parenthesis, will be used for anything you don't specify

var cbr = require('circuit-breaker-request').defaults({
	timeout: 25000, //total timeout for request including any time spend on retries (25000)
	maxFailures: 5, //Max consecutive errors, before closing circuit breaker (5)
	resetTimeout: 30000, //Amount of time circuit breaker will be closed on consecutive errors (30000)
	getGroupId: function getGroupId(url) {
    	var u = urlParser.parse(url);
        return u.protocol + u.host;
    }, //A function that returns the circuit-breaker group to use, given an URL. (default displayed)
	requestTimeout: 8333, //Timeout for each individual http request, (Math.floor(timeout/attempts))
	attempts: 3, //Number of attempts at HTTP request, retrying recoverable errors (3)
	delay: 500 //Delay between HTTP request retries, will back off to 500, 1000, 1500 (500)
});

cbr.get({url: 'https://google.com'}, function(err, resp){
	// handle err and resp. Any response that does not have http status code 2XX is an error here
});

cbr.get({url: 'https://debitoor.com'}, function(err, resp){
	// handle err and resp. Any response that does not have http status code 2XX is an error here
});

// ... more HTTP requests with cbr

//cbr request with special options, can also be used when defaults are not used.
cbr.get({timeout: 10000, requestTimeout: 10000, attempts: 5, url: 'https://debitoor.com'}, function(err, resp){
	// handle err and resp. Any response that does not have http status code 2XX is an error here
});
```

## Grouping

Circuit breaking is done per group of urls. By default the urls are grouped by protocol and host.
Here is an example of this grouping:

### Group 1
	https://debitoor.com/test
	https://debitoor.com
	https://debitoor.com/test?a=true

### Group 2
	https://developers.debitoor.com/api
	https://developers.debitoor.com
	https://developers.debitoor.com/api?b=false

### Group 3
	https://google.com/api
	https://google.com
	https://plus.google.com/api?b=false

Each group has it's own circuit breaker. So if errors start happening in group 1, it will not close down group 2 or 3.

You can create a different grouping by passing a function in the `getGroupId` parameter. The default getGroupId function
is:

```js
var urlParser = require('url');

function getGroupId(url) {
    var u = urlParser.parse(url);
    return u.protocol + u.host;
}
```

So anything with a URL on the same protocol and host will be in the same circuit-breaker. This means if there are 5
consecutive errors returned for URLs with the same protocol and host, the circuit-breaker will pause requests to that
protocol and host for a while, but anything on a different host and/or protocol will still be let through.

## License

[MIT](http://opensource.org/licenses/MIT)
