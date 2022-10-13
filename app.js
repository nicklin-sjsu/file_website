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
const url = require('url');
const moment = require("moment");
const multiparty = require("multiparty");
const fs = require('fs');
const app = express();

const port = process.env.PORT || 3000;
//var snsTopic = process.env.NEW_SIGNUP_TOPIC;
const lambda_url = process.env.LAMBDA_URL || 'https://uw25lpeced.execute-api.us-west-2.amazonaws.com/Prod/api/';

dotenv.config({
    path: path.resolve(__dirname, `.env.${process.env.NODE_ENV}`)
});

AWS.config.update({
    region: 'us-west-1',
    apiVersion: 'latest',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const s3 = new AWS.S3();

app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');
app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public/img'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function sns_message(message) {
    if (process.env.NODE_ENV == 'production') {
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
    console.log(message);
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
            files: req.file_list,
            admin: false,
            moment: moment,
            user_id: req.user.id,
        });
    }
    else if(req.user.type == 0 || req.user.type == null){
        res.render('admin', {
            users: req.user_list,
            manage_user_url: process.env.MANAGE_USER_URL,
        });
    }
});

app.get('/manage_user',checkAuthenticated, get_file_list, function(req, res){
    res.render('main', {
        files: req.file_list,
        admin: true,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        user_id: req.user.id,
        moment: moment
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
    var user_id;
    if (req.query.user_id != null){
        user_id = req.query.user_id;
    } else{
        user_id = req.user.id;
    }   
    var sql = mysql.format('SELECT * FROM files where user_id = ?', [user_id]);

    con.query(sql,function (err, result) {
        if (err) {
            sns_message("get_file_list failed with user_id = " + req.user.id + ": " + err);
            console.log(err);
        }
        else{
            var file_list = JSON.parse(JSON.stringify(result))
            req.file_list = file_list;
            next();
        }
    });
}

app.get('/sso', checkNotAuthenticated, function (req, res) {
    res.render('sso');
});

app.post('/upload_file', checkAuthenticated, function (req, res) {
    var user_id = req.user.id;
    var form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
        var fields_list = Object.entries(fields);
        var files_list = Object.entries(files);
        var file = files_list[0][1][0];
        var description = fields_list[0][1];
        var file_name = fields_list[1][1];
        const file_content = fs.readFileSync(file.path);

        var sql1 = mysql.format('SELECT * FROM files WHERE user_id = ? AND file_key = ?', [user_id, file_name]);
        con.query(sql1, function (err, result) {
            if (result.length > 0) {
                res.send({ 'code': 400, 'message': 'File with same name exists, please use another name' });
            } else {
                var params = {
                    Body: file_content,
                    Bucket: 'fileweb-aws-s3',
                    Key: user_id + "/" + file_name
                };
                s3.putObject(params, function (err, data) {
                    if (err) console.log(err, err.stack);
                    else {
                        console.log(file_name + " uploaded");
                        var sql = mysql.format('INSERT INTO files (user_id, file_key, description) VALUES (?, ?, ?)',
                            [user_id, file_name, description]);
                        con.query(sql, function (err, result) {
                            if (err) {
                                res.send({ 'code': 400, 'message': 'Internal upload error' });
                            } else {
                                res.send({ 'code': 200, 'message': file_name + ' uploaded successfully' });
                            }
                        });
                    }
                });
            }
        });
    });
});

app.post('/update_file', checkAuthenticated, function (req, res) {
    var user_id = req.user.id;
    var form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
        var fields_list = Object.entries(fields);
        var files_list = Object.entries(files);
        var file = files_list[0][1][0];
        var file_name = fields_list[0][1];
        const file_content = fs.readFileSync(file.path);
        
        var params = {
            Body: file_content,
            Bucket: 'fileweb-aws-s3',
            Key: user_id + "/" + file_name
        };
        s3.putObject(params, function (err, data) {
            if (err) console.log(err, err.stack);
            else {
                console.log("User " + req.user.id + " updated " + file_name + " belonging to user " + user_id);
                var sql = mysql.format('UPDATE files SET file_name = ?, WHERE user_id = ? AND file_name = ?',
                    [file_name, user_id, file_name]);
                con.query(sql, function (err, result) {
                    if (err) {
                        res.send({ 'code': 400, 'message': 'Internal update error' });
                    } else {
                        res.send({ 'code': 200, 'message': file_name + ' uploaded successfully' });
                    }
                });
            }
        });
    });
});

app.get('/get_file', checkAuthenticated, function (req, res) {
    var file_key = req.query.file_key;
    var user_id = req.user.id;
    if (req.query.user_id != null && req.user.type == 0) {
        user_id = req.query.user_id;
    }

    var sql = mysql.format('SELECT * FROM files WHERE file_key = ? and user_id = ?;',
        [file_key, user_id]);
    con.query(sql, function (err, result) {
        if (err) {
            res.send({ 'code': 401, 'message': 'Information error' });
        }
        if (result.length > 0) {
            var options = {
                Bucket: 'fileweb-aws-s3',
                Key: user_id + "/" + file_key,
            };
            res.attachment(file_key);
            var fileStream = s3.getObject(options).createReadStream();
            fileStream.pipe(res);
        } else {
            res.send({ 'code': 402, 'message': 'No such file existed' });
        }
    });
});

app.post('/del_file', checkAuthenticated, function (req, res) {
    var file_key = req.body.file_key;
    var user_id = req.user.id;
    if (req.body.user_id != null && req.uaer.type == 0) {
        user_id = parseInt(req.body.user_id);
    }

    var sql = mysql.format('SELECT * FROM files WHERE file_key = ? and user_id = ?;',
        [file_key, user_id]);
    con.query(sql, function (err, result) {
        if (err) {
            res.send({ 'code': 400, 'message': 'Information error' });
        }
        if (result.length > 0) {
            var params = { Bucket: 'fileweb-aws-s3', Key: user_id + "/" + file_key };

            s3.deleteObject(params, function (err, data) {
                if (err) console.log(err, err.stack);
                else {
                    var sql = mysql.format('DELETE FROM files WHERE file_key = ? and user_id = ?;',
                        [file_key, user_id]);
                    con.query(sql, function (err, result) {
                        if (err) {
                            res.send({ 'code': 400, 'message': 'Information error' });
                        } else {
                            res.send({ 'code': 200, 'message': 'File <' + file_key + '> deleted' });
                        }
                    })
                }
            });
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