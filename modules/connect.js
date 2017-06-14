/*!
 * connect
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

var debug = require('debug')('connect:dispatcher');
var EventEmitter = require('events').EventEmitter;
var finalhandler = require('finalhandler');
var http = require('http');

// 简单的遍历赋值合并 function(a, b)  a[n] = b[n]
var merge = require('utils-merge');
var parseUrl = require('parseurl');

/**
 * Module exports.
 * @public
 */

module.exports = createServer;

/**
 * Module variables.
 * @private
 */

var env = process.env.NODE_ENV || 'development'; // 默认环境，在启动程序的时候可以配置NODE_ENV
var proto = {};

/* istanbul ignore next */
/** 延迟处理函数 
 * 比如调用: defer(function(x){},3)
 * 参数x=3
 */
var defer = typeof setImmediate === 'function' ?
    setImmediate :
    function(fn) { process.nextTick(fn.bind.apply(fn, arguments)) }

/**
 * Create a new connect server.
 *
 * @return {function}
 * @public
 */

function createServer() { // 出口
    function app(req, res, next) { app.handle(req, res, next); } // http.createServer(fn)
    // proto主要实现的是下面定义的 use、handle、listen
    merge(app, proto);

    // 添加EventEmitter的原型方法给app
    // domain,_events,_maxListeners,setMaxListeners,getMaxListeners,emit,addListener,on,prependListener,
    // once,prependOnceListener,removeListener,removeAllListeners,listeners,listenerCount,eventNames
    merge(app, EventEmitter.prototype);

    app.route = '/';

    app.stack = [];
    return app;
}

/**
 * Utilize the given middleware `handle` to the given `route`,
 * defaulting to _/_. This "route" is the mount-point for the
 * middleware, when given a value other than _/_ the middleware
 * is only effective when that segment is present in the request's
 * pathname.
 *
 * For example if we were to mount a function at _/admin_, it would
 * be invoked on _/admin_, and _/admin/settings_, however it would
 * not be invoked for _/_, or _/posts_.
 * 可以看到这个use方法的任务便是中间件的登记，这样一来，自身的stack数组中
 * 充满了一个个登记了的{route: route , handle : fn}匿名函数。
 * 为请求到达时，匹配URL，并执行对应的函数，做好了在一个地点，统一格式化，统一存放
 *
 * @param {String|Function|Server} route, callback or server
 * @param {Function|Server} callback or server
 * @return {Server} for chaining
 * @public
 */

proto.use = function use(route, fn) {
    var handle = fn;
    var path = route;

    // default route to '/'
    if (typeof route !== 'string') { // 如果第一个参数不是字符串，一般就是function(req, res, next) {}
        handle = route;
        path = '/';
    }

    // wrap sub-apps
    // 如果fn为一个app的实例，则将其自身handle方法的包裹给fn
    if (typeof handle.handle === 'function') {
        var server = handle;
        server.route = path;
        handle = function(req, res, next) {
            server.handle(req, res, next);
        };
    }

    // wrap vanilla http.Servers
    // //如果fn为一个http.Server实例，则fn为其request事件的第一个监听器
    if (handle instanceof http.Server) {
        handle = handle.listeners('request')[0];
    }

    // strip trailing slash 去掉末尾斜杠
    if (path[path.length - 1] === '/') {
        path = path.slice(0, -1);
    }

    // add the middleware
    debug('use %s %s', path || '/', handle.name || 'anonymous');
    //  将一个包裹route和fn的匿名对象推入stack数组
    this.stack.push({ route: path, handle: handle });

    return this;
};

/**
 * Handle server requests, punting them down
 * the middleware stack.
 * 为当前请求路径寻找出在stack里所有与之相匹配的中间件
 * @private
 */

proto.handle = function handle(req, res, out) {
    // console.log(req.url);
    // 当前索引
    var index = 0;
    // 获取协议和路径
    var protohost = getProtohost(req.url) || '';
    var removed = '';
    // 标记：url是否以"/"结尾
    var slashAdded = false;
    var stack = this.stack;

    // final function handler
    // finalhandler: invoke as the final step to respond to HTTP request.
    // 若含有next（第三个）参数,则继续调用，若无，则使用finalhandler库，作为请求最后的处理函数，
    // 若有err则抛出，否则则报404
    var done = out || finalhandler(req, res, {
        env: env,
        onerror: logerror
    });

    // store the original URL 存储原来的req.url
    req.originalUrl = req.originalUrl || req.url;

    function next(err) {
        if (slashAdded) {
            // 去掉开头的斜杠
            req.url = req.url.substr(1);
            slashAdded = false;
        }

        if (removed.length !== 0) {
            // 恢复url
            req.url = protohost + removed + req.url.substr(protohost.length);
            removed = '';
        }

        // next callback 获取每一个中间件layer
        var layer = stack[index++];

        // all done  如果为空，说明已经处理完中间件
        if (!layer) {
            defer(done, err);
            return;
        }

        // route data，获取到真正的pathname,其实也就是用来和route匹配的
        var path = parseUrl(req).pathname || '/';

        // 得到statck栈中的本次route
        var route = layer.route;

        // skip this layer if the route doesn't match 
        // 先以route的长度获取path等长的子串，注意 如果route.length===0，说明是通用中间件，也是能匹配的
        // 如果route不匹配，直接跳过
        if (path.toLowerCase().substr(0, route.length) !== route.toLowerCase()) {
            return next(err);
        }

        // skip if route match does not border "/", ".", or end
        // 如果匹配到的路径不以'/'与‘.’结尾,或已结束，则表示不匹配(即上一个if保证了头匹配，这里保证了尾部匹配)
        // 注意： 数组或者字符串a, a[a.length]一般是undefined，
        var c = path[route.length];
        if (c !== undefined && '/' !== c && '.' !== c) {
            return next(err);
        }

        // 如果是通用中间件或者route已经匹配了，执行下面的操作
        // console.log(req.url);

        // trim off the part of the url that matches the route
        if (route.length !== 0 && route !== '/') {
            removed = route;
            // 得到querystring  比如： '?a=1'
            req.url = protohost + req.url.substr(protohost.length + removed.length);

            // ensure leading slash 保证路径以"/"开头 比如： '/?a=1'
            if (!protohost && req.url[0] !== '/') {
                req.url = '/' + req.url;
                slashAdded = true;
            }
        }

        // call the layer handle
        call(layer.handle, route, err, req, res, next);
    }

    next();
};

/**
 * Listen for connections.
 *
 * This method takes the same arguments
 * as node's `http.Server#listen()`.
 *
 * HTTP and HTTPS:
 *
 * If you run your application both as HTTP
 * and HTTPS you may wrap them individually,
 * since your Connect "server" is really just
 * a JavaScript `Function`.
 *
 *      var connect = require('connect')
 *        , http = require('http')
 *        , https = require('https');
 *
 *      var app = connect();
 *
 *      http.createServer(app).listen(80);
 *      https.createServer(options, app).listen(443);
 *
 * @return {http.Server}
 * @api public
 */

proto.listen = function listen() {
    var server = http.createServer(this);
    return server.listen.apply(server, arguments);
};

/**
 * Invoke a route handle.
 * @private
 */

function call(handle, route, err, req, res, next) {
    var arity = handle.length; // handle处理函数的参数个数
    var error = err;
    var hasError = Boolean(err); // 是否有错误

    debug('%s %s : %s', handle.name || '<anonymous>', route, req.originalUrl);

    try {
        if (hasError && arity === 4) { // 错误处理中间件handle
            // error-handling middleware
            handle(err, req, res, next);
            return;
        } else if (!hasError && arity < 4) { // 路由中间件handle
            // request-handling middleware
            handle(req, res, next);
            return;
        }
    } catch (e) {
        // replace the error
        error = e;
    }

    // continue
    next(error);
}

/**
 * Log error using console.error.
 * 输出error 信息
 * @param {Error} err
 * @private
 */

function logerror(err) {
    if (env !== 'test') console.error(err.stack || err.toString());
}

/**
 * Get get protocol + host for a URL.
 * 从url字符串中获取 协议和主机
 * @param {string} url
 * @private
 */

function getProtohost(url) {
    if (url.length === 0 || url[0] === '/') {
        return undefined;
    }
    // req.url中'?'字符的位置索引，用来判断是否有query string
    var searchIndex = url.indexOf('?');

    //获取url的长度( 除去querystring）
    var pathLength = searchIndex !== -1 ?
        searchIndex :
        url.length;
    var fqdnIndex = url.substr(0, pathLength).indexOf('://');

    return fqdnIndex !== -1 ?
        url.substr(0, url.indexOf('/', 3 + fqdnIndex)) :
        undefined;
}