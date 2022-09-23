var express = require('express');
const axios = require('axios');
var path = require('path');

var app = express();

app.set('views', path.join(__dirname, '../views'));
// app.set('view engine', 'jade');

app.use(express.static('/public'));

app.get('/', function(req, res) {
    res.render('layout', {title: 'Frontpage'});
});

app.get('/users', function (req, res) {
    const params = new URLSearchParams([['user_id', 1]]);
    axios.get('http://localhost:3000/get_user', { params })
    .then(result => {
        const user = result.data;
        if (user.code == 200) {
            res.render('index', { title: 'Get user', first_name: user.data.first_name, last_name: user.data.last_name });
        } else {
            res.render('error');
        }
    })
    .catch(error => {
        console.log(error);
        res.render('error');
    });
});

module.exports = app;