const express = require('express');
const request = require('request');
const mysql = require('mysql');
const bcrypt = require("bcrypt");
const formidable = require("formidable");
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const passport = require('passport');
const initializePassport = require('./passport-config');
const flash = require('express-flash');
const session = require('express-session');
const methodOverride = require('method-override');
const con = require('./db_connect.js');
const { get } = require('http');
const app = express();

var theme = 'slate';
const port = process.env.PORT || 3000;
//var snsTopic = process.env.NEW_SIGNUP_TOPIC;
const lambda_url = process.env.LAMBDA_URL || 'https://uw25lpeced.execute-api.us-west-2.amazonaws.com/Prod/api/';

dotenv.config({
    path: path.resolve(__dirname, `.env.${process.env.NODE_ENV}`)
});

AWS.config.update({
    region: 'us-west-2',
    apiVersion: 'latest',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');
app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public/img'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function sns_message(message) {
    var params = {
        Message: message,
        TopicArn: process.env.TOPIC_ARN,
        MessageGroupId: 'product-214'
    };

    var publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise();

    publishTextPromise
    .then(function (data) {
        console.log(`Message ${params.Message} sent to the topic ${params.TopicArn}`);
        console.log("MessageID is " + data.MessageId);
    })
    .catch(function (err) {
        console.error(err, err.stack);
    });
}

initializePassport(passport);

app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET || 'asdfasdfasdfasdfasdfadsfasdfasdfasdfasdfasdfasdfasdfadsf',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', checkAuthenticated, get_file_list, get_user_list, function (req, res) {
    if (req.user.type == 1){
        res.render('main', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false',
            first_name: req.user.first_name,
            last_name: req.user.last_name,
            files: req.file_list
        });
    }
    else if(req.user.type == 0 || req.user.type == null){
        res.render('admin', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false',
            first_name: req.user.first_name,
            last_name: req.user.last_name,
            users: req.user_list
        });

    }
});

app.get('/manage_user',checkAuthenticated, get_file_list, function(req, res){
    res.render('main', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false',
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        files: req.file_list
    });
})

function get_user_list(req, res, next){
    var sql = mysql.format('SELECT * FROM users');

    con.query(sql,function (err, result) {
        if (err) {
            console.log('Something Wrong');
        }
        else{
            var user_list = JSON.parse(JSON.stringify(result))
            req.user_list = user_list;
            next()
            
        }
    });
}

function get_file_list(req, res, next){
    var sql;
    const url = require('url');
    const queryObject = url.parse(req.url, true).query;
    console.log(queryObject);
    if (queryObject.user_id != null){
        console.log("req body", queryObject.user_id);
        sql = mysql.format('SELECT * FROM files where user_id = ?'
        , [queryObject.user_id]
        );
    } else{
        console.log(req.user.id, "getfile print");
        sql = mysql.format('SELECT * FROM files where user_id = ?'
        , [req.user.id]
        );
    }   

    con.query(sql,function (err, result) {
        if (err) {
            sns_message("get_file_list failed with user_id = " + req.user.id + ": " + err);
            console.log(err);
        }
        else{
            var file_list = JSON.parse(JSON.stringify(result))
            console.log(file_list)
            req.file_list = file_list;
            next()
            
        }
    });
}

app.get('/sso', checkNotAuthenticated, function (req, res) {
    res.render('sso', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false'
    });
});

app.post('/upload_file', checkAuthenticated, function (req, res) {
    let user_id = req.user.id;
    const form = formidable({ multiples: true });
    form.parse(req, (err, fields, files) => {
        var fields_list = Object.entries(fields);
        var files_list = Object.entries(files);
        for (let i = 0; i < files_list.length; i++) {
            var [filed_key, description] = fields_list[i];
            const [key, file] = files_list[i];
                
            let file_name = file.originalFilename;
            var file_key = user_id + '/' + file_name;
            var sql = mysql.format('INSERT INTO files (user_id, file_key, description) VALUES (?, ?, ?)', 
            [user_id, file_name, description]);
            con.query(sql, function (err, result) {
                if (err) {
                    res.send({ 'code': 400, 'message': 'Information error' });
                }
                console.log('Row added to TABLE files');
                request.post(
                    lambda_url + 'file/' + file_key,
                    { file },
                    function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            res.send({ 'code': 200, 'message': 'Upload Successfully' });
                        } else {
                            console.log(error);
                        }
                    }
                );
            });
        }
    });
});

app.post('/get_file', checkAuthenticated, function (req, res) {
    let user_id = req.user.id;
    var file_key = req.body.file_key;

    var sql = mysql.format('SELECT * FROM files WHERE file_key = ? and user_id = ?)',
        [file_key, user_id]);
    con.query(sql, function (err, result) {
        if (err) {
            res.send({ 'code': 400, 'message': 'Information error' });
        }
        if (result.length > 0) {
            request.post(
                lambda_url + 'get_file/' + file_key,
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        res.send({ 'code': 200, 'message': 'Get file successfully', 'data': response.data });
                    } else {
                        console.log(error);
                    }
                }
            );
        } else {
            res.send({ 'code': 400, 'message': 'No such file existed' });
        }
    });
});

app.post('/signin', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/sso',
    failureFlash: true
}));

app.post('/signup', checkNotAuthenticated, function (req, res) {
    try {
        var first_name = req.body.first_name;
        var last_name = req.body.last_name;
        var email = req.body.email;
        var password = req.body.password;

        var sql = mysql.format('SELECT * FROM users WHERE email = ?', [email]);
        con.query(sql, function (err, result) {
            if (result.length > 0) {
                res.send({ 'code': 400, 'message': 'Email already used' });
            } else {
                bcrypt.genSalt(10, (err, salt) => {
                    bcrypt.hash(password, salt, function (err, hash) {
                        var sql2 = mysql.format('INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)',
                            [first_name, last_name, email, hash]);
                        con.query(sql2, function (err, result) {
                            if (err) {
                                console.log(err);
                                res.send({ 'code': 400, 'message': 'Internal Error' });
                            } else {
                                console.log('row added to TABLE user');
                                res.send({ 'code': 200, 'message': 'Account registered' });
                            }
                        })
                    });
                })
            }
        });
    } catch {
        res.redirect('/register');
    }
});

app.post('/signout', checkAuthenticated, function (req, res, next) {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect('/sso');
    });
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/sso');
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    next();
}

app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});

module.exports = app;