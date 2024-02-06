const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs'); // Import the 'fs' module

const dotenv = require("dotenv").config();

const imap = new Imap({
    user: process.env.USER,
    password: process.env.PASSWORD,
    host: process.env.HOST,
    port: 993,
    tls: true,
});

function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
}

imap.once('ready', function () {
    openInbox(function (err, box) {
        if (err) throw err;
        const f = imap.seq.fetch('1:*', {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
            struct: true
        });
        f.on('message', function (msg, seqno) {
            console.log('Message #%d', seqno);
            const prefix = '(#' + seqno + ') ';

            msg.on('body', function (stream, info) {
                let buffer = '';
                stream.on('data', function (chunk) {
                    buffer += chunk.toString('utf8');
                });
                stream.once('end', function () {
                    // Parse the email using mailparser
                    simpleParser(buffer, (err, parsed) => {
                        const { from, subject, textAsHtml, text } = parsed;
                        console.log(text, "<<<<<<<<< test")
                        // if (err) {
                        //     console.log('Error parsing email:', err);
                        //     return;
                        // }

                        // console.log('Parsed Email:', parsed);

                        // // Check for attachments
                        // if (parsed.attachments.length > 0) {
                        //     parsed.attachments.forEach((attachment, index) => {
                        //         console.log('Attachment #%d:', index + 1);
                        //         console.log('Filename:', attachment.filename);
                        //         console.log('Content Type:', attachment.contentType);
                        //     });
                        // }
                    });
                });
            });

            // msg.once('attributes', function (attrs) {
            //     console.log(prefix + 'Attributes:', attrs);
            // });

            msg.once('end', function () {
                console.log(prefix + 'Finished');
            });
        });

        f.once('error', function (err) {
            console.log('Fetch error: ' + err);
        });

        f.once('end', function () {
            console.log('Done fetching all messages!');
            imap.end();
        });
    });
});

imap.once('error', function (err) {
    console.log(err);
});

imap.once('end', function () {
    console.log('Connection ended');
});

imap.connect();
