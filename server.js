// server.js
const express = require('express');
const dotenv = require("dotenv").config();
const path = require('path');
const redis = require("redis");
const connectRedis = require("connect-redis");
const session = require("express-session");
const cookieParser = require('cookie-parser');
const router = require("./app/router/router");

const app = express();

// Initialize Redis
let RedisStore, redisClient;
if (process.env.NODE_ENV === 'development') {
    RedisStore = connectRedis(session);
    redisClient = redis.createClient({
        host: 'localhost',
        port: 6379,
        legacyMode: true,
    });
    redisClient.connect();

    redisClient.on("error", function (err) {
        console.log("Could not establish a connection with redis. " + err)
    });
    redisClient.on("connect", function (err) {
        console.log("Connected to redis successfully 👍👍👍👍👍👍👍👍")
    });
}

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
        ...(process.env.NODE_ENV === "development" && {
            store: new RedisStore({ client: redisClient }),
        }),
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

// Export the Express app
module.exports = app;
