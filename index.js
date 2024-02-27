'use strict';

(function () {
    // Importing Packages
    const express = require('express');
    const dotenv = require("dotenv").config();
    const path = require('path');
    const session = require("express-session");
    const cookieParser = require('cookie-parser');
    const router = require("./app/router/router");

    // Creating Express Application
    const app = express();

    // Initializing Port 
    const port = process.env.PORT || 4000;

    // Initializing Globals 
    global.app = app;
    global.basePath = __dirname;

    // Setting EJS 
    app.use(express.static(__dirname + ""));
    app.set('views', [path.join(__dirname, 'app/views/')]);
    app.set('view engine', 'ejs');

    // Setting Session Middleware
    app.use(
        session({
            secret: "verySecretKey",
            cookie: {
                secure: false,
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
            },
            saveUninitialized: true,
            resave: false,
        })
    );

    // Parsing Data
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    app.use(cookieParser());

    // Allowing CORS
    app.use(function (req, res, next) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        next();
    });

    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    // Listening on routes
    app.use('/', router);

    // Starting server on port
    app.listen(port, function () {
        console.log("Server listening on port....", port);
    });

    module.exports = app;
})();

