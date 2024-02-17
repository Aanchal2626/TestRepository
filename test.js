const dotenv = require("dotenv").config();

const { ImapFlow } = require('imapflow');

const fetchEmails = async (filter = {}, pageSize = 10, offset = 0) => {
    const client = new ImapFlow({
        host: process.env.HOST,
        port: 993,
        secure: true,
        auth: {
            user: process.env.USER,
            pass: process.env.PASSWORD
        },
        logger: false
    });

    await client.connect();
    await client.mailboxOpen('INBOX');

    let emails = [];

    try {
        let searchCriteria = {};

        if (filter.subject) {
            searchCriteria.subject = filter.subject;
        }

        if (filter.seen == 'false') {
            searchCriteria.seen = false;
        } else if (filter.seen == 'true') {
            searchCriteria.seen = true;
        }
        if (filter.keyword) {
            searchCriteria.keyword = filter.keyword;
        }
        if (filter.from) {
            searchCriteria.from = filter.from;
        }
        if (filter.to) {
            searchCriteria.to = filter.to;
        }
        if (filter.on) {
            searchCriteria.on = filter.on;
        }

        if (filter.sentOn) {
            searchCriteria.sentOn = filter.sentOn;
        }


        offset = offset * pageSize;
        const allUids = await client.search(searchCriteria);
        console.log(searchCriteria, "<<<<<<<<")
        const startIndex = Math.max(0, Math.min(allUids.length - 1, allUids.length - offset - pageSize));
        const endIndex = Math.min(allUids.length, startIndex + pageSize);

        const pageUids = allUids.slice(startIndex, endIndex).reverse();
        for await (let message of client.fetch(pageUids, { envelope: true, flags: true })) {
            emails.push(message);
        }
    } catch (err) {
        console.error(err, "<<<<<<<<<< ERR");
    }
    await client.logout();

    return emails;
};

const filter = {
    //subject: "",
    //seen: 'false'
    //from: "",
    //to: "jimmydhingra.ac@spsingla.com"
    //keyword: "Test",
    //on: "2024-02-01",
    sentOn: ""
};

fetchEmails(filter, 10, 0)
    .then(emails => {
        console.log(emails);
    })
    .catch(err => console.error(err));

