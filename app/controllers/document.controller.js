const { pool } = require("../helpers/database.helpers");
const AWS = require('aws-sdk');
const moment = require("moment");
const { v4: uuidv4 } = require('uuid');

const documentController = {};

// AWS Config 
AWS.config.update({
    accessKeyId: process.env.BUCKET_KEY,
    secretAccessKey: process.env.BUCKET_SECRET,
    region: process.env.BUCKET_REASON,
});

// Initializing S3
const s3 = new AWS.S3();

// Initializing Textract
const textract = new AWS.Textract();

documentController.generateDocumentNumber = async (req, res) => {
    try {
        let inputs = req.query;
        let token = req.session.token;
        if (token.user_role == "3") {
            return res.send({ status: 0, msg: "Access Denied. Insufficient Permissions." });
        }
        if (!inputs.site_id) {
            return res.send({ status: 0, msg: "Invalid Site Id" });
        }

        let query = `SELECT * FROM site_records WHERE sr_id = ${inputs.site_id}`;

        let dataFromDb = await pool.query(query);

        if (dataFromDb.rows.length == 0) {
            return res.send({ status: 0, msg: "Site record not found" });
        }
        res.send({ status: 1, msg: "Success", payload: dataFromDb.rows[0] });
    } catch (error) {
        console.error(error);
        res.send({ status: 0, msg: "Internal Server Error" });
    }
}

documentController.getDocumentReference = async (req, res) => {
    try {
        let inputs = req.query;
        let token = req.session.token;
        if (token.user_role == "3") {
            return res.send({ status: 0, msg: "Access Denied. Insufficient Permissions." });
        }
        if (!inputs.query) {
            return res.send({ status: 0, msg: "Invalid Query" });
        }

        let referenceQuery = 'SELECT doc_number FROM documents WHERE doc_number ILIKE $1';
        let dataFromDb = await pool.query(referenceQuery, [`%${inputs.query}%`]);
        let referenceNumbers = dataFromDb.rows.map(row => row.doc_number);
        res.send({ status: 1, msg: "Success", payload: referenceNumbers });
    } catch (error) {
        console.error(error);
        res.send({ status: 0, msg: "Internal Server Error" });
    }
}

documentController.saveDraft = async (req, res) => {
    try {
        let inputs = req.body;
        let token = req.session.token;

        if (token.user_role == "3") {
            return res.send({ status: 0, msg: "Access Denied. Insufficient Permissions." });
        }

        const generateInsertQuery = (data) => {
            if (inputs.doc_reference && Array.isArray(inputs.doc_reference)) {
                inputs.doc_reference = inputs.doc_reference.join(',');
            }

            if (data.doc_file) {
                delete data.doc_file;
            }

            const keys = Object.keys(data);
            const nonEmptyKeys = keys.filter(key => {
                const value = data[key];
                const isEmpty = value === '' || value === null || (Array.isArray(value) && value.length === 0) || value === '[]';
                return !isEmpty;
            });

            nonEmptyKeys.push('doc_uploaded_by', 'doc_uploaded_date', 'doc_status');

            const currentDate = moment().format('MM/DD/YYYY');
            data['doc_uploaded_by'] = token.user_name;
            data['doc_uploaded_date'] = currentDate;
            data['doc_status'] = 'Drafted';

            const columns = nonEmptyKeys.join(', ');

            const values = nonEmptyKeys.map(key => {
                let value = data[key];
                value = typeof value === 'string' ? (value.trim() === '' ? null : `'${value}'`) : value;
                return value;
            }).join(', ');

            const updateValues = nonEmptyKeys.map(key => {
                if (key !== 'id') {
                    let value = data[key];
                    value = typeof value === 'string' ? (value.trim() === '' ? null : `'${value}'`) : value;
                    return `${key} = ${value}`;
                }
                return null;
            }).filter(value => value !== null).join(', ');

            const query = `INSERT INTO documents (${columns}) VALUES (${values}) ON CONFLICT (doc_number) DO UPDATE SET ${updateValues};`;
            return query;
        };

        const query = generateInsertQuery(inputs);
        let selectQuery = `SELECT COUNT(*) FROM documents WHERE doc_number = '${inputs.doc_number}'`;
        let selectResult = await pool.query(selectQuery);
        selectResult = selectResult?.rows[0]?.count;
        let dataFromDb = await pool.query(query);
        if (dataFromDb && selectResult == 0) {
            let updateSiteRecordQuery = `
            UPDATE site_records
            SET sr_value = sr_value + 1
            WHERE sr_id = (SELECT site_id FROM sites WHERE site_name = '${inputs.doc_folder}');
        `;
            await pool.query(updateSiteRecordQuery);
        }
        res.send({ status: 1, msg: "Success" })
    } catch (error) {
        console.error(error);
        res.send({ status: 0, msg: "Internal Server Error" });
    }
}

documentController.createDocument = async (req, res) => {
    try {
        let inputs = req.body;
        let token = req.session.token;

        if (token.user_role == "3") {
            return res.send({ status: 0, msg: "Access Denied. Insufficient Permissions." });
        }

        if (!req.file) {
            return res.send({ status: 0, msg: "No file uploaded" });
        }

        if (inputs.doc_reference && Array.isArray(inputs.doc_reference)) {
            inputs.doc_reference = inputs.doc_reference.join(',');
        }

        const fileName = uuidv4();

        const s3Params = {
            Bucket: process.env.BUCKET_NAME,
            Key: `${fileName}.pdf`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const s3Response = await s3.upload(s3Params).promise();
        const pdfLocation = s3Response.Location;

        const generateInsertQuery = (data) => {
            const keys = Object.keys(data);
            const nonEmptyKeys = keys.filter(key => {
                const value = data[key];
                return value !== undefined && value !== null && (Array.isArray(value) ? value.length > 1 : (typeof value === 'string' ? value.trim() !== '' : true));
            });

            nonEmptyKeys.push('doc_uploaded_by', 'doc_uploaded_date', 'doc_status', 'doc_pdf_link');
            const currentDate = moment().format('MM/DD/YYYY');
            data['doc_uploaded_by'] = token.user_name;
            data['doc_uploaded_date'] = currentDate;
            data['doc_status'] = 'Uploaded';
            data['doc_pdf_link'] = pdfLocation;
            const columns = nonEmptyKeys.join(', ');
            const values = nonEmptyKeys.map(key => {
                let value = data[key];
                if (typeof value === 'string') {
                    value = value.trim() === '' ? null : `'${value}'`;
                }
                return value;
            }).join(', ');

            const updateValues = nonEmptyKeys.map(key => {
                if (key !== 'id') {
                    let value = data[key];
                    if (typeof value === 'string') {
                        value = value.trim() === '' ? null : `'${value}'`;
                    }
                    return `${key} = ${value}`;
                }
                return null;
            }).filter(value => value !== null).join(', ');

            const query = `INSERT INTO documents (${columns}) VALUES (${values}) ON CONFLICT (doc_number) DO UPDATE SET ${updateValues};`;
            return query;
        };


        let query = generateInsertQuery(inputs);
        let selectQuery = `SELECT COUNT(*) FROM documents WHERE doc_number = '${inputs.doc_number}'`;
        let selectResult = await pool.query(selectQuery);
        selectResult = selectResult?.rows[0]?.count;
        let dataFromDb = await pool.query(query);

        // Maintaing site record to auto generate document numbers
        if (dataFromDb && selectResult == 0) {
            let updateSiteRecordQuery = `
            UPDATE site_records
            SET sr_value = sr_value + 1
            WHERE sr_id = (SELECT site_id FROM sites WHERE site_name = '${inputs.doc_folder}');
        `;
            await pool.query(updateSiteRecordQuery);
        }

        // Replied Vide
        let references = inputs.doc_reference?.split(',');
        if (references?.length === 1 && references[0] !== "") {
            references = [inputs.doc_reference];
        }
        const updateQuery = `
            UPDATE documents
            SET doc_replied_vide = CASE
                                        WHEN doc_replied_vide IS NULL THEN $1
                                        WHEN $1 = ANY(string_to_array(doc_replied_vide, ', ')) THEN doc_replied_vide
                                        ELSE doc_replied_vide || ', ' || $1
                                    END
            WHERE doc_number = ANY($2)
        `;
        await pool.query(updateQuery, [inputs.doc_number, references]);

        res.send({ status: 1, msg: "Success" })

        try {
            const startTextractParams = {
                DocumentLocation: {
                    S3Object: {
                        Bucket: process.env.BUCKET_NAME,
                        Name: `${fileName}.pdf`,
                    },
                },
                ClientRequestToken: uuidv4(),
            };

            const startTextractResponse = await textract.startDocumentTextDetection(startTextractParams).promise();
            const jobId = startTextractResponse.JobId;

            const getStatusParams = { JobId: jobId };
            let textractResult = null;

            do {
                const statusResponse = await textract.getDocumentTextDetection(getStatusParams).promise();
                const status = statusResponse.JobStatus;

                if (status === 'SUCCEEDED') {
                    textractResult = statusResponse.Blocks.reduce((acc, block) => {
                        if (block.BlockType === 'LINE') {
                            acc += block.Text + ",";
                        }
                        return acc;
                    }, '');

                } else if (status === 'FAILED' || status === 'PARTIAL_SUCCESS') {
                    console.error('Textract job failed or partially succeeded. Status:', status);
                    return res.send({ status: 0, msg: 'Textract job failed or partially succeeded', error: statusResponse });
                } else {
                    console.log('Textract job still in progress. Status:', status);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            } while (textractResult === null);
            console.log("Textract job completed successfully");
            let ocr_content_query = `UPDATE documents SET doc_ocr_content = $1, doc_ocr_proccessed = true WHERE doc_number = $2`;
            await pool.query(ocr_content_query, [textractResult, inputs.doc_number]);
            console.log("Content Update Successfully");

        } catch (error) {
            console.error(error);
        }
    } catch (error) {
        res.send({ status: 0, msg: "Something Went Wrong" })
        console.error(error);
    }
}

module.exports = documentController;