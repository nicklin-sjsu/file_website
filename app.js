'use strict';
var debug = require('debug')('my express app');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');
var mysql = require('mysql');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(routes);
// app.use('/users', users);
// app.use(app.router);
// routes.initialize(app);

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "file_website"
});

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
});

app.get('/get_user', (req, res) => {
    let user_id = req.query.user_id;
    var sql = mysql.format("SELECT * FROM users WHERE id = ?", [user_id]);
    con.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send({ 'code': 400, 'message': 'Invalid user id' });
        } else {
            if (result.length > 0) {
                res.send({ 'code': 200, 'data': {'first_name': result[0].first_name, 'last_name': result[0].last_name}} );
            } else {
                res.send({ 'code': 400, 'message': 'Invalid user id' });
            }
            
        }
        
    });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});


// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function () {
    debug('Express server listening on port ' + server.address().port);
});
