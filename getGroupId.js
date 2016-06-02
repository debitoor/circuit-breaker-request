var urlParser = require('url');
module.exports = function getGroupId(url) {
	var u = urlParser.parse(url);
	return u.protocol + u.host;
};