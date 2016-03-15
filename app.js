var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passport = require('passport');
var session = require('express-session');

global.pool = require('./config/dbpool');
require('./config/passportConfig')(passport);

var auth = require('./routes/auth');
var notice = require('./routes/notice');
var faq = require('./routes/faq');
var accessterm = require('./routes/accessterm');
var policies = require('./routes/policies');
var greenspace = require('./routes/greenspace');
var background = require('./routes/background');
var greenplayer = require('./routes/greenplayer');
var greenshop = require('./routes/greenshop');
var methodOverride = require('method-override');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('short'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  "secret" : "TLezlKDvRJdKvYjoHdYTgiIzvTuUjtWur1spgBEgewY=",
  //"secret" : "8/ETEX3IKHEWqcTzFNxzjte3UlelHroD4yrYHk0kR8U=", //cmd > openssl rand -base64 32 명령으로 생성한 임의값
  //원래 secret은 process.env.server_key 이런 식으로 OS 환경변수에 넣어 사용하고 키값을 직접 적지는 않는다.
  "cookie" : {"maxAge" : 86400000}, // 1000ms * 60초 * 60분 * 24시간. 하루동안 세션을 유지하겠다.
  "resave" : true,
  "saveUninitialized" : true
}));
app.use(express.static(path.join(__dirname, 'uploads')));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

app.use('/auth', auth);
app.use('/notices', notice);
app.use('/faqs', faq);
app.use('/policies', policies);
app.use('/accessterms', accessterm);
app.use('/greenspaces', greenspace);
app.use('/backgrounds', background);
app.use('/greenplayers', greenplayer);
app.use('/items', greenshop);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      code: err.code,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    code: err.code,
    error: {}
  });
});


module.exports = app;
