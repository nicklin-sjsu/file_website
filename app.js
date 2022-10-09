var express = require('express');
var request = require('request');
var mysql = require('mysql');
var bcrypt = require("bcrypt");
var formidable = require("formidable");
var AWS = require('aws-sdk');
var bodyParser = require('body-parser');
var path = require('path');

var app = express();

var port = process.env.PORT || 3000;

//var snsTopic = process.env.NEW_SIGNUP_TOPIC;
var theme = 'slate';

app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');

app.use(express.static(__dirname + '/static'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
AWS.config.region = process.env.REGION

var con = mysql.createConnection({
    host: 'file-website-rds.cm3uialzguhs.us-west-2.rds.amazonaws.com',
    user: 'root',
    password: 'password',
    port: '3306',
    database: 'file_website',
});

con.connect(function (err) {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to database.');
});

app.get('/', function (req, res) {
    if (user == null) {
        res.render('sso', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    } else {
        res.render('main', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    }
});

app.get('/sso', function (req, res) {
    res.render('sso', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false'
    });
});

app.get('/main', function (req, res) {
    if (user == null) {
        res.render('sso', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    } else {
        res.render('main', {
            theme: process.env.THEME || theme,
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    }
});

app.get('/test', function (req, res) {
    res.render('test', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false',
        uploadurl: 'https://uw25lpeced.execute-api.us-west-2.amazonaws.com/Prod/api/file/'
    });
});

var user = null;

app.get('/get_user', (req, res) => {
    let user_id = req.query.user_id;
    var sql = mysql.format('SELECT * FROM users WHERE id = ?', [user_id]);
    con.query(sql, function (err, result) {
        if (err) {
            res.send({ 'code': 400, 'message': 'Invalid user id' });
        } else {
            if (result.length > 0) {
                res.send({ 'code': 200, 'data': { 'first_name': result[0].first_name, 'last_name': result[0].last_name } });
            } else {
                res.send({ 'code': 400, 'message': 'Invalid user id' });
            }

        }

    });
});

app.post('/upload_file', (req, res) => {
    if (user == null) {
        res.send({ 'code': 402, 'message': 'Please Login first' });
    } else {
        let user_id = user.id;
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
                        'https://uw25lpeced.execute-api.us-west-2.amazonaws.com/Prod/api/file/' + file_key,
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
    }
});

app.post('/signin', function (req, res) {
    var email = req.body.email;
    var password = req.body.password;
    var sql = mysql.format('SELECT password FROM users WHERE email = ?', [email]);
    con.query(sql, function (err, result) {
        if (result.length > 0) {
            var user_pass = result[0].password;
            bcrypt.compare(password, user_pass, function (err, compare_result) {
                if (err) {
                    res.send({ 'code': 400, 'message': 'Internal Error' });
                } else {
                    if (compare_result) {
                        var sql = mysql.format('SELECT id, first_name, last_name, email FROM users WHERE email = ?',
                            [email]);
                        con.query(sql, function (err, result) {
                            user = result[0];
                            res.send({ 'code': 200, 'data': { 'id': user['id'] }, 'message': 'Login Success' });
                        });
                    } else {
                        res.send({ 'code': 401, 'message': 'Password Does Not Match' });
                    }
                }
            });
        }
    });
});


app.post('/signup', function (req, res) {
    var first_name = req.body.first_name;
    var last_name = req.body.last_name;
    var email = req.body.email;
    var password = req.body.password;

    var sql = mysql.format('SELECT * FROM users WHERE email = ?', [email]);
    con.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send({ 'code': 400, 'message': 'Internal error' });
        } else {
            if (result.length > 0) {
                res.send({ 'code': 400, 'message': 'Email already used' });
            } else {
                bcrypt.genSalt(10, (err, salt) => {
                    bcrypt.hash(password, salt, function (err, hash) {
                        var sql2 = mysql.format('INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)',
                            [first_name, last_name, email, hash]);
                        con.query(sql2, function (err, result) {
                            if (err) {
                                res.send({ 'code': 400, 'message': 'Email already used' });
                            }
                            console.log('row added to TABLE user');
                            res.send({ 'code': 200 });
                        });
                    });
                })
            }
        }
    });

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

//var port = process.env.PORT || 3000;

app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});
//module.exports = app;




// app.listen(port);
module.exports = app;