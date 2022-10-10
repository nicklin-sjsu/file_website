if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')
var request = require('request');
var mysql = require('mysql');
var formidable = require("formidable");
var AWS = require('aws-sdk');
var bodyParser = require('body-parser');
var path = require('path');
var dotenv = require('dotenv');

const initializePassport = require('./passport-config')
//initializePassport(
//    passport,
//    email => users.find(user => user.email === email),
//    id => users.find(user => user.id === id)
//)

//const users = []

var con = mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PWD || 'root',
    port: process.env.DATABASE_PORT || 3306,
    database: process.env.DATABASE_DATABASE || 'file_website',
});
var theme = 'slate';

con.connect(function (err) {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to database.');
});


initializePassport(passport);


app.set('view-engine', 'ejs')
app.set('views', __dirname + '/public');
app.use(express.urlencoded({ extended: false }))
app.use(flash())
//app.use(session({
//    secret: process.env.SESSION_SECRET,
//    resave: false,
//    saveUninitialized: false
//}))
app.use(session({
    secret: process.env.SESSION_SECRET || 'asdfasdfasdfasdfasdfadsfasdfasdfasdfasdfasdfasdfasdfadsf',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/static'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
AWS.config.region = process.env.REGION

app.get('/', checkAuthenticated, (req, res) => {
    res.render('main.ejs', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false'
    });
})

app.get('/sso', checkNotAuthenticated, (req, res) => {
    res.render('sso.ejs', {
        theme: process.env.THEME || theme,
        flask_debug: process.env.FLASK_DEBUG || 'false'
    });
})

app.post('/signin', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/sso',
    failureFlash: true
}))

app.get('/register', checkNotAuthenticated, (req, res) => {
    res.render('register.ejs')
})

app.post('/register', checkNotAuthenticated, async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        users.push({
            id: Date.now().toString(),
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword
        })
        res.redirect('/login')
    } catch {
        res.redirect('/register')
    }
})

app.delete('/logout', (req, res) => {
    req.logOut()
    res.redirect('/sso')
})

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    res.redirect('/sso')
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    next()
}

app.listen(3000)