const { pool } = require("../helpers/database.helpers");
const AWS = require('aws-sdk');
const moment = require("moment");
const { v4: uuidv4 } = require('uuid');
const { simpleParser } = require('mailparser');
const Imap = require('imap');

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
            return res.send({ status: 0, msg: "Access Denie Insufficient Permissions." });
        }
        if (!inputs.site_id) {
            return res.send({ status: 0, msg: "Invalid Site Id" });
        }

        let query = `SELECT * FROM sites WHERE site_id = ${inputs.site_id}`;

        let dataFromDb = await pool.query(query);

        if (dataFromDb.rows.length == 0) {
            return res.send({ status: 0, msg: "Site record not found" });
        }
        console.log(dataFromDb, "<<<<<<")
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
            return res.send({ status: 0, msg: "Access Denie Insufficient Permissions." });
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
            return res.send({ status: 0, msg: "Access Denied Insufficient Permissions." });
        }

        const generateInsertQuery = (data) => {
            if (inputs.doc_reference && Array.isArray(inputs.doc_reference)) {
                inputs.doc_reference = inputs.doc_reference.join(',');
            }
            delete data.doc_file
            data['doc_uploaded_by'] = token.user_name;
            data['doc_uploaded_at'] = moment().format('MM/DD/YYYY');
            data['doc_status'] = 'DRAFTED';

            const keys = Object.keys(data);
            const columns = keys.join(', ');
            let values = '', updateValues = '';

            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let value = data[key];
                if (value == "") {
                    value = null;
                }
                if (typeof value == 'string') {
                    value = `'${value}'`;
                }
                values += (i > 0 ? ', ' : '') + value;
            }

            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                if (key !== 'doc_number') {
                    let value = data[key];

                    if (value == "") {
                        value = null;
                    }
                    if (typeof value == 'string') {
                        value = `'${value}'`;
                    }
                    console.log(key, "=", value);
                    let updatePart = `${key} = ${value}`;
                    if (updateValues.length > 0) {
                        updateValues += ', ';
                    }
                    updateValues += updatePart;
                }
            }
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
            UPDATE sites
            SET site_record_value = site_record_value + 1
            WHERE site_name = '${inputs.doc_folder}';
        `;
            await pool.query(updateSiteRecordQuery);
        }
        res.send({ status: 1, msg: "Success", payload: inputs.doc_number })
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
            return res.send({ status: 0, msg: "Access Denie Insufficient Permissions." });
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

            nonEmptyKeys.push('doc_uploaded_by', 'doc_uploaded_at', 'doc_status', 'doc_pdf_link', 'doc_uploaded_by_id', 'doc_source');
            const currentDate = moment().format('MM/DD/YYYY');
            data['doc_uploaded_by'] = token.user_name;
            data['doc_uploaded_by_id'] = token.user_id;
            data['doc_uploaded_at'] = currentDate;
            data['doc_status'] = 'UPLOADED';
            data['doc_pdf_link'] = pdfLocation;
            data['doc_source'] = "FORM"
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
            UPDATE sites
            SET site_record_value = site_record_value + 1
            WHERE site_name = '${inputs.doc_folder}';
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

        res.send({ status: 1, msg: "Success", payload: inputs.doc_number })

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

            try {
                const startTextractResponse = await textract.startDocumentTextDetection(startTextractParams).promise();
                const jobId = startTextractResponse.JobId;

                const textractResult = await processTextractJob(jobId);

                await pool.query(`INSERT INTO doc_metadata (dm_id, dm_ocr_content) VALUES ($1, $2) ON CONFLICT (dm_id) DO UPDATE SET dm_ocr_content = EXCLUDED.dm_ocr_content;`, [inputs.doc_number, textractResult]);
                await pool.query(`UPDATE documents SET doc_ocr_proccessed = true WHERE doc_number = '${inputs.doc_number}';`);

                console.log("Content Update Successfully");
            } catch (error) {
                console.error("An error occurred:", error);
            }

        } catch (error) {
            console.error(error);
        }
    } catch (error) {
        res.send({ status: 0, msg: "Something Went Wrong" })
        console.error(error);
    }
}

documentController.getFilteredDocuments = async (req, res) => {
    try {
        let query = `SELECT d.doc_site, d.doc_type, d.doc_number, d.doc_created_at, d.doc_uploaded_at, d.doc_status, d.doc_from, d.doc_to, d.doc_purpose, d.doc_subject, d.doc_reference, d.doc_replied_vide, d.doc_storage_location, d.doc_uploaded_by, d.doc_folder 
                     FROM documents d`;

        let filters = req.body;
        let filterApplied = false;

        if (Object.keys(filters).length > 0) {
            if ('dm_ocr_content' in filters) {
                query += ` JOIN doc_metadata dm ON d.doc_number = dm.dm_id`;
            }
            query += ' WHERE ';
            for (const key in filters) {
                if (key === 'dm_ocr_content') {
                    query += `dm.dm_ocr_content LIKE '%${filters[key]}%'`;
                    filterApplied = true;
                } else {
                    if (filters[key]) {
                        if (filterApplied) {
                            query += ' AND ';
                        }
                        query += `d.${key} = '${filters[key]}'`;
                        filterApplied = true;
                    }
                }
            }
        }
        let { rows: documents } = await pool.query(query);
        res.json({ status: 1, msg: 'Success', payload: { documents } });
    } catch (err) {
        console.error('Error fetching filtered documents:', err);
        res.json({ status: 0, msg: 'Internal Server Error' });
    }
}

documentController.getImportDocuments = async (req, res) => {
    try {
        let token = req.session.token;
        let inputs = req.body;
        console.log(inputs, "<<<<<")
        let query = `SELECT * FROM users WHERE user_id = ${token.user_id}`;
        const { rows: [dataFromDb] } = await pool.query(query);

        const payload = await fetchEmails(dataFromDb.user_email, dataFromDb.user_password, inputs.pageSize, inputs.currentPage);
        res.json({ status: 1, payload });
    } catch (err) {
        console.log(err);
        res.status(500).json({ status: 0, msg: "Internal Server Error" });
    }
}

async function fetchEmails(userEmail, userPassword, pageSize = 10, page = 1) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: userEmail,
            password: userPassword,
            host: process.env.HOST,
            port: 993,
            tls: true,
        });

        function openInbox(cb) {
            imap.openBox('INBOX', true, cb);
        }

        imap.once('error', function (err) {
            console.log(err);
            if (err.source == "timeout-auth") {
                reject("Invalid Credentials");
            }
        });

        imap.once('ready', function () {
            openInbox(function (err, box) {
                if (err) reject(err);

                const totalEmails = box.messages.total;
                const totalPages = Math.ceil(totalEmails / pageSize);

                const start = (page - 1) * pageSize + 1;
                const end = Math.min(start + pageSize - 1, totalEmails); // Ensure end doesn't exceed total emails

                if (totalEmails === 0) {
                    resolve({ emails: [], totalRecords: 0, totalPages: 0 });
                    return;
                }

                const f = imap.seq.fetch(`${start}:${end}`, {
                    envelope: true,
                    bodies: ''
                });

                const emails = [];

                f.on('message', function (msg, seqno) {
                    const attributes = {};
                    let message = '';

                    msg.on('body', function (stream, info) {
                        simpleParser(stream, {}, function (err, parsed) {
                            if (err) reject(err);
                            message = parsed;
                        });
                    });

                    msg.once('attributes', function (attrs) {
                        const flagsWithoutPrefix = attrs.flags.filter(flag => !flag.startsWith('\\') && !flag.startsWith('$'));
                        attributes.subject = attrs.envelope.subject;
                        attributes.date = attrs.envelope.date;
                        attributes.from = attrs.envelope.from[0].mailbox + "@" + attrs.envelope.from[0].host;
                        attributes.to = attrs.envelope.to[0].mailbox + "@" + attrs.envelope.to[0].host;
                        attributes.flags = flagsWithoutPrefix;
                        attributes.seen = attrs.flags.includes('\\Seen');
                        attributes.messageId = attrs.envelope.messageId;
                        console.log(attrs)
                    });

                    msg.once('end', function () {
                        const email = {
                            subject: attributes.subject,
                            date: attributes.date,
                            from: attributes.from,
                            to: attributes.to,
                            messageId: attributes.messageId,
                            flags: attributes.flags,
                            seen: attributes.seen,
                            attachments: message.attachments ? message.attachments.length : 0
                        };
                        emails.push(email);
                    });
                });

                f.once('error', function (err) {
                    reject(err);
                });

                f.once('end', function () {
                    resolve({ emails, totalRecords: totalEmails, totalPages });
                });
            });
        });

        imap.once('end', function () {
            console.log('Connection ended');
        });

        imap.connect();
    });
}



module.exports = documentController;