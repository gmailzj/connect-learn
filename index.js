// copy到本地connect
var connect = require('./modules/connect');
var http = require('http');

var app = connect();

// gzip/deflate outgoing responses
var compression = require('compression');
app.use(compression());

// store session state in browser cookie
var cookieSession = require('cookie-session');
app.use(cookieSession({
    keys: ['secret1', 'secret2']
}));

// parse urlencoded request bodies into req.body
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));

// respond to all requests
app.use(function(req, res, next) {
    //res.end('Hello from Connect!\n');
    next();
});

app.use(function middleware1(req, res, next) {
    // middleware 1
    console.log(Date.now())
    next();
});
app.use(function middleware2(req, res, next) {
    // middleware 2
    next();
});

app.use('/', function(req, res, next) {
    res.end("index");
});
app.use('/foo', function fooMiddleware(req, res, next) {
    // req.url starts with "/foo"
    next();
});
app.use('/bar', function barMiddleware(req, res, next) {
    // req.url starts with "/bar"
    next();
});

// regular middleware
app.use(function(req, res, next) {
    // i had an error
    next(new Error('boom!'));
});

// error middleware for errors that occurred in middleware
// declared before this
app.use(function onerror(err, req, res, next) {
    // an error occurred!
});
//create node.js http server and listen on port
http.createServer(app).listen(3000);