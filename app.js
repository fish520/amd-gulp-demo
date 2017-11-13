var express = require('express');
var path = require('path');
var app = express();

// ...

if (app.get('env') == 'development') {
	app.use('/html', function(req, res, next){
		var filePath = decodeURIComponent('public' + req.originalUrl);
		if(/\.html(?:$|\?|#)/i.test(filePath)) {
			require('ejs').renderFile(filePath, function(err, str){
				if(err) {
					res.send('<pre>' + err.stack + '</pre>');
					return;
				}
				res.send(str);
				res.end();
			});
		} else {
			next();
		}
	});
	app.use('/html', require('serve-index')('public/html', {'icons': true}));
}

app.use(express.static(path.join(__dirname, 'public')));

// ...

module.exports = app;
