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
        let { rows: document } = await pool.query(`SELECT doc_number,doc_pdf_link FROM documents WHERE doc_ocr_proccessed = false AND doc_pdf_link IS NOT NULL LIMIT 1`);

        // Doesn't have documents to process
        if (document.length == 0) return
        document = document[0];

        // Extracting document name from 
        let doc_pdf_name = new URL(document.doc_pdf_link)
        doc_pdf_name = doc_pdf_name.pathname.substring(1).replace("docs/", "");
        console.log(doc_pdf_name)
        await client.query('INSERT INTO crons (cron_doc_number, cron_start_time) VALUES ($1, $2)', [document.doc_number, getCurrentDateTime()]);

        const startTextractParams = {
            DocumentLocation: {
                S3Object: {
                    Bucket: process.env.BUCKET_NAME,
                    Name: document.doc_pdf_link,
                },
            },
            ClientRequestToken: uuidv4(),
        };

        async function processTextractJob(jobId, nextToken = null, textractResult = '') {
            const getStatusParams = {
                JobId: jobId,
                NextToken: nextToken
            };

            const statusResponse = await textract.getDocumentTextDetection(getStatusParams).promise();
            const status = statusResponse.JobStatus;

            if (status === 'SUCCEEDED') {
                textractResult += statusResponse.Blocks.reduce((acc, block) => {
                    if (block.BlockType === 'LINE') {
                        acc += block.Text + ",";
                    }
                    return acc;
                }, '');

                if (statusResponse.NextToken) {
                    return processTextractJob(jobId, statusResponse.NextToken, textractResult);
                } else {
                    console.log("Textract job completed successfully");
                    return textractResult;
                }
            } else if (status === 'FAILED' || status === 'PARTIAL_SUCCESS') {
                console.error('Textract job failed or partially succeeded. Status:', status);
                throw new Error('Textract job failed or partially succeeded');
            } else {
                console.log('Textract job still in progress. Status:', status);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return processTextractJob(jobId, nextToken, textractResult);
            }
        }

        const startTextractResponse = await textract.startDocumentTextDetection(startTextractParams).promise();
        const jobId = startTextractResponse.JobId;

        const textractResult = await processTextractJob(jobId);

        await pool.query(`INSERT INTO doc_metadata (dm_id, dm_ocr_content) VALUES ($1, $2) ON CONFLICT (dm_id) DO UPDATE SET dm_ocr_content = EXCLUDED.dm_ocr_content;`, [inputs.doc_number, textractResult]);
        await pool.query(`UPDATE documents SET doc_ocr_proccessed = true WHERE doc_number = '${inputs.doc_number}';`);

        console.log("Content Update Successfully");

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