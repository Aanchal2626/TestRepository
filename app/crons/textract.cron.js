const { pool } = require("../helpers/database.helpers");
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const moment = require('moment');
const AWS = require('aws-sdk');

// AWS Config 
AWS.config.update({
    accessKeyId: process.env.BUCKET_KEY,
    secretAccessKey: process.env.BUCKET_SECRET,
    region: process.env.BUCKET_REGION,
});

// Initializing Textract
const textract = new AWS.Textract();

const ProcessDocument = async () => {
    try {
        const client = await pool.connect();
        const { rowCount: crons } = await client.query('SELECT * FROM crons WHERE cron_status = false');

        // Returing previous cron is still running
        if (crons) return

        // Previous cron stopped running starting new
        let { rows: document } = await pool.query(`SELECT doc_number,doc_pdf_link FROM documents WHERE doc_ocr_proccessed = false AND doc_status != 'DRAFTED' LIMIT 1`);

        // Doesn't have documents to process
        if (document.length == 0) return
        document = document[0];

        await client.query('INSERT INTO crons (cron_doc_number, cron_start_time) VALUES ($1, $2)', [document.doc_number, getCurrentDateTime()]);


        client.release();
    } catch (err) {
        console.error('Error executing query', err);
    }
};

const getCurrentDateTime = () => {
    const timeStamp = moment().format('DD/MM/YYYY hh:mm:ss A');
    return timeStamp;
};

cron.schedule('*/5 * * * * *', ProcessDocument);