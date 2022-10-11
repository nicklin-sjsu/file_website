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
const app = express();

var theme = 'slate';
const port = process.env.PORT || 3000;
//var snsTopic = process.env.NEW_SIGNUP_TOPIC;
const lambda_url = process.env.LAMBDA_URL || 'https://uw25lpeced.execute-api.us-west-2.amazonaws.com/Prod/api/';

dotenv.config({
    path: path.resolve(__dirname, `.env.${process.env.NODE_ENV}`)
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');
app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public/img'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
AWS.config.region = process.env.REGION

initializePassport(passport);

app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET || 'asdfasdfasdfasdfasdfadsfasdfasdfasdfasdfasdfasdfasdfadsf',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', checkAuthenticated, get_file_list, function (req, res) {
    console.log(req.user.id);
    // var target_files = get_file_list(req.user.id);
    console.log(req.file_list);
    res.render('main', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false',
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        files: req.file_list
    });
});

function get_file_list(req, res, next){
    var sql = mysql.format('SELECT * FROM files where user_id = ?'
    , [req.user.id]
    );
    
    con.query(sql,function (err, result) {
        // console.log(result);
        if (err) {
            console.log('Something Wrong');
        }
        else{
            var file_list = JSON.parse(JSON.stringify(result))
            // console.log(data);
            console.log(file_list)
            req.file_list = file_list;
            console.log(req.file_list);
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
    // ddb.putItem({
    //     'TableName': ddbTable,
    //     'Item': item,
    //     'Expected': { email: { Exists: false } }
    // }, function(err, data) {
    //     if (err) {
    //         var returnStatus = 500;

    //         if (err.code === 'ConditionalCheckFailedException') {
    //             returnStatus = 409;
    //         }

    //         res.status(returnStatus).end();
    //         console.log('DDB Error: ' + err);
    //     } else {
    //         sns.publish({
    //             'Message': 'Name: ' + req.body.name + '\r\nEmail: ' + req.body.email
    //                                 + '\r\nPreviewAccess: ' + req.body.previewAccess
    //                                 + '\r\nTheme: ' + req.body.theme,
    //             'Subject': 'New user sign up!!!',
    //             'TopicArn': snsTopic
    //         }, function(err, data) {
    //             if (err) {
    //                 res.status(500).end();
    //                 console.log('SNS Error: ' + err);
    //             } else {
    //                 res.status(201).end();
    //             }
    //         });
    //     }
    // });
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