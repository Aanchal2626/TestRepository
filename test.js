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
            envelope: true
        });
        let emails = [];
        f.on('message', function (msg, seqno) {

            msg.once('attributes', function (attrs) {
                emails.push(attrs.envelope)
            });
            msg.once('end', function () {
                fs.writeFileSync("test.txt", JSON.stringify(emails))
                console.log(emails.length)
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

const emailIdToFetch = '<ab1edc28-8725-4d67-a9bd-cd49c78474db@spsingla.com>';

// imap.once('ready', function () {
//     openInbox(function (err, box) {
//         if (err) throw err;

//         // Search for the email with the given message ID
//         imap.seq.search([['HEADER', 'Message-ID', emailIdToFetch]], function (err, uids) {
//             if (err) throw err;
//             if (!uids || uids.length === 0) {
//                 console.log('Email with message ID ' + emailIdToFetch + ' not found.');
//                 imap.end();
//                 return;
//             }

//             // Fetch the email using the UID
//             const f = imap.seq.fetch(uids, {
//                 bodies: '', // Fetch the entire email including attachments
//                 struct: true
//             });
//             f.on('message', function (msg, seqno) {
//                 //console.log('Message #%d', seqno);
//                 const prefix = '(#' + seqno + ') ';

//                 // Event handler for when the message attributes are received
//                 msg.once('attributes', function (attrs) {
//                     //console.log(attrs)
//                 });

//                 // Event handler for when the message body is received
//                 msg.once('body', function (stream, info) {
//                     let buffer = '';
//                     stream.on('data', function (chunk) {
//                         buffer += chunk.toString('utf8');
//                     });
//                     stream.once('end', function () {
//                         // Parse the email body using mailparser
//                         simpleParser(buffer, (err, parsed) => {
//                             if (err) {
//                                 console.log('Error parsing email:', err);
//                                 return;
//                             }
//                             // Extract attachment URLs from parsed email
//                             if (parsed.attachments && parsed.attachments.length > 0) {
//                                 parsed.attachments.forEach(attachment => {
//                                     console.log('Filename:', attachment.filename);
//                                     console.log('URL:', attachment.contentDisposition);
//                                     console.log(attachment)
//                                     fs.writeFileSync("./text.pdf", attachment.content);
//                                 });
//                             } else {
//                                 console.log('No attachments found in the email.');
//                             }
//                         });
//                     });
//                 });

//                 msg.on('attachment', function (attachment) {
//                     console.log('Attachment:', attachment);
//                 });

//                 msg.once('end', function () {
//                     console.log(prefix + 'Finished');
//                 });
//             });

//             f.once('error', function (err) {
//                 console.log('Fetch error: ' + err);
//             });

//             f.once('end', function () {
//                 console.log('Done fetching the message!');
//                 imap.end();
//             });
//         });
//     });
// });
imap.once('error', function (err) {
    console.log(err);
});

imap.once('end', function () {
    console.log('Connection ended');
});

imap.connect();
