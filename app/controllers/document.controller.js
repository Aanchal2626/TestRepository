const { pool } = require("../helpers/database.helpers");
const AWS = require('aws-sdk');
const moment = require("moment");
const multer = require('multer');
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
            if (inputs.doc_reference) {
                inputs.doc_reference = inputs.doc_reference.join(',');
            }
            if (data.doc_file) {
                delete data.doc_file
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
                let value = typeof data[key] === 'string' ? `'${data[key]}'` : data[key];
                return value;
            }).join(', ');
            const updateValues = nonEmptyKeys.map(key => {
                if (key !== 'id') {
                    const value = typeof data[key] === 'string' ? `${key} = '${data[key]}'` : `${key} = ${data[key]}`;
                    return value;
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
        if (dataFromDb && selectResult > 0) {
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

        if (inputs.doc_reference) {
            inputs.doc_reference = inputs.doc_reference.join(',');
        }

        const fileName = uuidv4();

        const s3Params = {
            Bucket: process.env.BUCKET_NAME,
            Key: `${fileName}.pdf`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        //const s3Response = await s3.upload(s3Params).promise();
        //const pdfLocation = s3Response.Location;
        const pdfLocation = "https://spsingla-docs.s3.ap-south-1.amazonaws.com/7cea7e5b-a1bd-4a9e-8844-5dc7974b5d92.pdf";

        const generateInsertQuery = (data) => {
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
            data['doc_status'] = 'Processing';
            data['doc_pdf_link'] = pdfLocation;

            const columns = nonEmptyKeys.join(', ');
            const values = nonEmptyKeys.map(key => {
                let value = typeof data[key] === 'string' ? `'${data[key]}'` : data[key];
                return value;
            }).join(', ');
            const updateValues = nonEmptyKeys.map(key => {
                if (key !== 'id') {
                    const value = typeof data[key] === 'string' ? `${key} = '${data[key]}'` : `${key} = ${data[key]}`;
                    return value;
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

        if (dataFromDb && selectResult > 0) {
            let updateSiteRecordQuery = `
            UPDATE site_records
            SET sr_value = sr_value + 1
            WHERE sr_id = (SELECT site_id FROM sites WHERE site_name = '${inputs.doc_folder}');
        `;
            await pool.query(updateSiteRecordQuery);
        }
        // references.forEach(reference => {
        //     const selectQuery = {
        //         text: 'SELECT doc_replied_vide FROM documents WHERE doc_number = $1',
        //         values: [inputs.doc_number]
        //     };

        //     pool.query(selectQuery)
        //         .then(res => {
        //             const oldValue = res.rows[0] ? res.rows[0].doc_replied_vide || '[]' : '[]';

        //             const updatedValue = JSON.stringify([...JSON.parse(oldValue), reference]);

        //             const updateQuery = {
        //                 text: 'UPDATE documents SET doc_replied_vide = $1 WHERE doc_number = $2',
        //                 values: [updatedValue, inputs.doc_number]
        //             };

        //             pool.query(updateQuery)
        //                 .then(res => {
        //                     console.log(`Updated rows for reference ${reference}:`, res.rowCount);
        //                 })
        //                 .catch(err => {
        //                     console.error(`Error updating rows for reference ${reference}:`, err);
        //                 });
        //         })
        //         .catch(err => {
        //             console.error(`Error retrieving doc_replied_vide for reference ${reference}:`, err);
        //         });
        // });
        res.send({ status: 1, msg: "Success" })

    } catch (error) {
        console.error(error);
        res.send({ status: 0, msg: "Internal Server Error" });
    }
}


module.exports = documentController;