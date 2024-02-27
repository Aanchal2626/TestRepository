const { pool } = require("../helpers/database.helpers");
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const moment = require('moment');
const AWS = require('aws-sdk');
const dotenv = require("dotenv").config();

// AWS Config 
AWS.config.update({
    accessKeyId: process.env.BUCKET_KEY,
    secretAccessKey: process.env.BUCKET_SECRET,
    region: process.env.BUCKET_REGION,
});


// Initializing S3
const s3 = new AWS.S3();

// Initializing Textract
const textract = new AWS.Textract();

const ProcessDocument = async (cronJob) => {
    const client = await pool.connect();
    try {

        const { rowCount: crons } = await client.query('SELECT * FROM crons WHERE cron_status = false');

        // Returing previous cron is still running
        if (crons) {
            console.log("Previous cron is still running")
            return
        }

        // Previous cron stopped running starting new
        let { rows: document } = await pool.query(`SELECT doc_number,doc_pdf_link FROM documents WHERE doc_ocr_proccessed = false AND doc_pdf_link IS NOT NULL LIMIT 1`);

        // Doesn't have documents to process
        if (document.length == 0) {
            console.log("Nothing to process stopping cron")
            return
        }
        document = document[0];

        // Extracting document name from 
        let doc_pdf_name = new URL(document.doc_pdf_link)
        doc_pdf_name = doc_pdf_name.pathname;
        doc_pdf_name = doc_pdf_name.replace("/docs/", "docs/");

        await client.query('INSERT INTO crons (cron_doc_number, cron_start_time) VALUES ($1, $2)', [document.doc_number, getCurrentDateTime()]);

        const startTextractParams = {
            DocumentLocation: {
                S3Object: {
                    Bucket: process.env.BUCKET_NAME,
                    Name: doc_pdf_name,
                },
            },
            ClientRequestToken: uuidv4(),
        };

        async function processTextractJob(jobId, nextToken = null, textractResult = '', totalPagesProcessed = 0) {
            const getStatusParams = {
                JobId: jobId,
                NextToken: nextToken
            };

            const statusResponse = await textract.getDocumentTextDetection(getStatusParams).promise();
            const status = statusResponse.JobStatus;

            // Update total pages processed if DocumentMetadata is available
            if (statusResponse.DocumentMetadata) {
                totalPagesProcessed = statusResponse.DocumentMetadata.Pages;
            }

            if (status === 'SUCCEEDED') {
                textractResult += statusResponse.Blocks.reduce((acc, block) => {
                    if (block.BlockType == 'LINE' || block.BlockType == 'WORD') {
                        acc += block.Text + ",";
                    }
                    return acc;
                }, '');

                if (statusResponse.NextToken) {
                    console.log(statusResponse.NextToken, "<<<<<<<<<<")
                    return processTextractJob(jobId, statusResponse.NextToken, textractResult, totalPagesProcessed);
                } else {
                    console.log("Textract job completed successfully");
                    console.log(`Total pages processed: ${totalPagesProcessed}`);
                    return { textractResult, totalPagesProcessed };
                }
            } else if (status === 'FAILED' || status === 'PARTIAL_SUCCESS') {
                console.error('Textract job failed or partially succeeded. Status:', status);
                throw new Error('Textract job failed or partially succeeded');
            } else {
                console.log('Textract job still in progress. Status:', status);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return processTextractJob(jobId, nextToken, textractResult, totalPagesProcessed);
            }
        }


        const startTextractResponse = await textract.startDocumentTextDetection(startTextractParams).promise();
        const jobId = startTextractResponse.JobId;

        const textractData = await processTextractJob(jobId);

        // Assuming you have document.doc_number available
        const documentDataQuery = `
            SELECT doc_folder, doc_site
            FROM documents
            WHERE doc_number = $1;
            `;

        // Fetching folder name and site name from the documents table
        const { rows: documentData } = await pool.query(documentDataQuery, [document.doc_number]);
        if (documentData.length > 0) {
            const { doc_folder, doc_site } = documentData[0];

            // inserting content into doc_metadata 
            const insertQuery = `
                INSERT INTO doc_metadata (dm_id, dm_ocr_pages, dm_ocr_content, dm_folder_name, dm_site_name)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (dm_id) DO UPDATE SET 
                    dm_ocr_content = EXCLUDED.dm_ocr_content, 
                    dm_ocr_pages = EXCLUDED.dm_ocr_pages,
                    dm_folder_name = EXCLUDED.dm_folder_name,
                    dm_site_name = EXCLUDED.dm_site_name;
            `;

            await pool.query(insertQuery, [
                document.doc_number,
                textractData.totalPagesProcessed,
                textractData.textractResult,
                doc_folder,
                doc_site
            ]);
        }

        await pool.query(`UPDATE documents SET doc_ocr_proccessed = true WHERE doc_number = '${document.doc_number}';`);
        await client.query(`UPDATE crons SET cron_end_time = '${getCurrentDateTime()}', cron_status = true`);
        console.log("Content Update Successfully");
    } catch (err) {
        console.error('Error executing query', err);
    } finally {
        client.release();
    }
};

const getCurrentDateTime = () => {
    const timeStamp = moment().format('DD/MM/YYYY hh:mm:ss A');
    return timeStamp;
};


const job = cron.schedule('*/30 * * * * *', () => ProcessDocument(job));


