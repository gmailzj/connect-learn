// copy到本地connect
var connect = require('./modules/connect');
var http = require('http');

var app = connect();

// gzip/deflate outgoing responses
var compression = require('compression');
// app.use(compression());

// store session state in browser cookie
var cookieSession = require('cookie-session');
// app.use(cookieSession({
//     keys: ['secret1', 'secret2']
// }));

// parse urlencoded request bodies into req.body
// for parsing application/x-www-form-urlencoded
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));

// respond to all requests
app.use(function middleware_all(req, res, next) {
    //res.end('Hello from Connect!\n');
    next();
});

// 下面两个是通用模块，每次请求都会执行
app.use(function middleware1(req, res, next) {
    // middleware 1 打印当前时间戳
    console.log(Date.now())
    console.log(1)
    next();
});
app.use(function middleware2(req, res, next) {
    console.log(2)
        // middleware 2  设置httpHeader
    res.setHeader('ver', '1.0.0');
    next();
});

// 注意这里要双斜杠才是首页
app.use('//', function indexMiddleware(req, res, next) {
    res.end("index");
});

app.use('/foo', function fooMiddleware(req, res, next) {
    res.end("foo");
});

app.use('/bar', function barMiddleware(req, res, next) {
    // req.url starts with "/bar"
    console.log(req.body);
    res.end("bar");
});

// 如果上面的路由都没有匹配到，说明出错了
// regular middleware
app.use(function error404(req, res, next) {
    // i had an error
    next(new Error('error!'));
});

// error middleware for errors that occurred in middleware
// declared before this
app.use(function onerror(err, req, res, next) {
    // an error occurred!
    res.end(err.message);
});
//create node.js http server and listen on port
http.createServer(app).listen(3000);