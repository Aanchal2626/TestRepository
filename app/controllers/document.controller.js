const { pool } = require("../helpers/database.helpers");
const { BrowserWindow, ipcMain, dialog } = require('electron');
const { simpleParser } = require('mailparser');
const { ImapFlow } = require('imapflow');
const { v4: uuidv4 } = require('uuid');
const moment = require("moment");
const AWS = require('aws-sdk');
const axios = require('axios');
const xlsx = require('xlsx');
const path = require("path");
const fs = require("fs");

const documentController = {};

// AWS Config 
AWS.config.update({
    accessKeyId: "AKIAW2T4SFQSPKIQHQWE",
    secretAccessKey: "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",
    region: "ap-south-1",
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

        let dataFromDb = await pool.query(`SELECT * FROM sites WHERE site_id = ${inputs.folder_id}`);

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
        if (dataFromDb && selectResult == 0 && inputs.doc_type == "OUTGOING") {
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
            Bucket: "spsingla-docs",
            Key: `docs/${fileName}.pdf`,
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
        if (dataFromDb && selectResult == 0 && inputs.doc_type == "OUTGOING") {
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

        // try {
        //     const startTextractParams = {
        //         DocumentLocation: {
        //             S3Object: {
        //                 Bucket: "spsingla-docs",
        //                 Name: `docs/${fileName}.pdf`,
        //             },
        //         },
        //         ClientRequestToken: uuidv4(),
        //     };

        //     async function processTextractJob(jobId, nextToken = null, textractResult = '') {
        //         const getStatusParams = {
        //             JobId: jobId,
        //             NextToken: nextToken
        //         };

        //         const statusResponse = await textract.getDocumentTextDetection(getStatusParams).promise();
        //         const status = statusResponse.JobStatus;

        //         if (status === 'SUCCEEDED') {
        //             textractResult += statusResponse.Blocks.reduce((acc, block) => {
        //                 if (block.BlockType === 'LINE') {
        //                     acc += block.Text + ",";
        //                 }
        //                 return acc;
        //             }, '');

        //             if (statusResponse.NextToken) {
        //                 return processTextractJob(jobId, statusResponse.NextToken, textractResult);
        //             } else {
        //                 console.log("Textract job completed successfully");
        //                 return textractResult;
        //             }
        //         } else if (status === 'FAILED' || status === 'PARTIAL_SUCCESS') {
        //             console.error('Textract job failed or partially succeeded. Status:', status);
        //             throw new Error('Textract job failed or partially succeeded');
        //         } else {
        //             console.log('Textract job still in progress. Status:', status);
        //             await new Promise(resolve => setTimeout(resolve, 10000));
        //             return processTextractJob(jobId, nextToken, textractResult);
        //         }
        //     }

        //     try {
        //         const startTextractResponse = await textract.startDocumentTextDetection(startTextractParams).promise();
        //         const jobId = startTextractResponse.JobId;

        //         const textractResult = await processTextractJob(jobId);

        //         await pool.query(`INSERT INTO doc_metadata (dm_id, dm_ocr_content) VALUES ($1, $2) ON CONFLICT (dm_id) DO UPDATE SET dm_ocr_content = EXCLUDED.dm_ocr_content;`, [inputs.doc_number, textractResult]);
        //         await pool.query(`UPDATE documents SET doc_ocr_proccessed = true WHERE doc_number = '${inputs.doc_number}';`);

        //         console.log("Content Update Successfully");
        //     } catch (error) {
        //         console.error("An error occurred:", error);
        //     }

        // } catch (error) {
        //     console.error(error);
        // }
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
                    query += `LOWER(dm.dm_ocr_content) LIKE LOWER('%${filters[key]}%')`;
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
        let query = `SELECT * FROM users WHERE user_id = ${token.user_id}`;
        const { rows: [dataFromDb] } = await pool.query(query);
        const filter = inputs.filter;
        const payload = await fetchEmails(filter, inputs.pageSize, inputs.offset, dataFromDb.user_email, dataFromDb.user_email_password);
        if (payload.emails.length > 0) {
            for (let i = 0; i < payload.emails.length; i++) {
                let query = `SELECT * FROM doc_email_imports WHERE dei_msg_id = '${payload.emails[i].uid}'`;
                let dataFromDb = await pool.query(query);
                if (dataFromDb.rows.length > 0) {
                    payload.emails[i].imported = true
                } else {
                    payload.emails[i].imported = false
                }
            }
        }
        res.json({ status: 1, payload });
    } catch (err) {
        console.log(err);
        res.status(500).json({ status: 0, msg: "Internal Server Error" });
    }
}

documentController.importExcelDocuments = async (req, res) => {

}

const fetchEmails = async (filter = {}, pageSize = 10, offset = 0, user, password) => {
    const client = new ImapFlow({
        host: process.env.HOST,
        port: 993,
        secure: true,
        auth: {
            user: user,
            pass: password
        },
        logger: false
    });

    await client.connect();
    await client.mailboxOpen('INBOX');
    let payload = {
        emails: [],
        totalRecords: 0,
        totalPages: 0
    };
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
        const startIndex = Math.max(0, Math.min(allUids.length - 1, allUids.length - offset - pageSize));
        const endIndex = Math.min(allUids.length, startIndex + pageSize);
        const pageUids = allUids.slice(startIndex, endIndex);
        for await (let message of client.fetch(pageUids, { envelope: true, flags: true })) {

            let email = {
                subject: message.envelope.subject,
                date: moment(message.envelope.date).format('DD/MM/YYYY'),
                from: message.envelope.from.map(address => address.address).join(', '),
                to: message.envelope.to.map(address => address.address).join(', '),
                uid: message.uid,
                seen: message.flags.has('\\Seen'),
                flags: [...message.flags].filter(flag => !flag.startsWith('$') && flag !== '\\Seen')
            }
            payload.emails.push(email);
        }
        payload.totalRecords = allUids.length;
        payload.totalPages = Math.ceil(payload.totalRecords / pageSize);
    } catch (err) {
        console.error(err, "<<<<<< ERR");
    }
    await client.logout();

    return payload;
};


documentController.importExcelDocument = async (req, res) => {
    try {
        let inputs = req.body;
        let token = req.session.token;

        if (!inputs.doc_site && !inputs.doc_folder && !inputs.doc_type) {
            return res.send({ status: 0, msg: "Invalid Request" });
        }

        let uploadedFile = await selectExcelFile();
        if (!uploadedFile) return res.send({ status: 0, msg: "Invalid Request" });

        // Fetching latest excel format
        let formatExcelLink = await pool.query(`SELECT misc_format_link FROM misc WHERE misc_id = 1`);
        formatExcelLink = formatExcelLink.rows[0].misc_format_link;

        // Download the format Excel file into a buffer
        const formatExcelResponse = await axios.get(formatExcelLink, { responseType: 'arraybuffer' });

        // Parse the format Excel file from memory
        let formatWorkbook = xlsx.read(formatExcelResponse.data, { type: 'buffer' });
        let formatSheet = formatWorkbook.Sheets[formatWorkbook.SheetNames[0]];
        let formatSheetJson = xlsx.utils.sheet_to_json(formatSheet, { header: 1 });
        let formatSheetHeaders = formatSheetJson[0];

        // Read the uploaded Excel file from memory
        let uploadedWorkbook = xlsx.read(uploadedFile.data, { type: 'buffer' });
        let uploadedSheet = uploadedWorkbook.Sheets[uploadedWorkbook.SheetNames[0]];
        let uploadedSheetJson = xlsx.utils.sheet_to_json(uploadedSheet, { header: 1 });
        let uploadedSheetHeaders = uploadedSheetJson.shift();
        uploadedSheetJson = uploadedSheetJson.filter(row => row.some(cell => cell !== ''));

        // Check if the number of headers match
        if (formatSheetHeaders.length !== uploadedSheetHeaders.length) {
            return res.send({ status: 0, msg: "Headers do not match: Different number of columns" });
        }

        // Check if each header matches
        for (let i = 0; i < formatSheetHeaders.length; i++) {
            if (formatSheetHeaders[i] !== uploadedSheetHeaders[i]) {
                return res.send({ status: 0, msg: `Headers do not match: Mismatch at index ${i}` });
            }
        }

        const pdfDirectory = path.dirname(uploadedFile.selectedFilePath);
        const fileName = uuidv4();
        const s3Params = {
            Bucket: "spsingla-docs",
            Key: `excels/${fileName}.xlsx`,
            Body: uploadedFile.data,
            ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };

        // const s3Response = await s3.upload(s3Params).promise();

        // const excelLocation = s3Response.Location;

        const excelLocation = `https://spsingla-docs.s3.ap-south-1.amazonaws.com/excels/121423f5-7e83-49c4-afe9-50cfed61707b.xlsx`

        let uploadBatchId = await pool.query(`
            INSERT INTO doc_excel_imports (excel_batch_size, excel_batch_progress, excel_date, excel_status, excel_link) 
            VALUES ('${uploadedSheetJson.length}', '0', '${moment().format('DD/MM/YYYY hh:mm A')}', 'UPLOADING', '${excelLocation}')
            RETURNING *;
        `);

        uploadBatchId = uploadBatchId.rows[0];

        if (uploadBatchId) {
            res.send({ status: 1, msg: "Excel Uploading Queued" });
        } else {
            return res.send({ status: 0, msg: "Something Went Wrong" });
        }
        try {
            for (let i = 0; i < uploadedSheetJson.length; i++) {
                const row = uploadedSheetJson[i];
                let document = {};

                // Processing Document Number 
                try {
                    let doc_number = row[0].replace(/\s/g, '');
                    if (!doc_number || doc_number == "") {
                        await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_number')`)
                        continue
                    } else {
                        document.doc_number = doc_number;
                    }
                } catch (err) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_number')`);
                    continue
                }

                let duplicateEntryCount = await pool.query(`SELECT count(*) FROM documents WHERE doc_number = '${document.doc_number}'`);
                duplicateEntryCount = duplicateEntryCount.rows[0].count;

                if (duplicateEntryCount != 0) {
                    const dublicateQuery = `
                        INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                        VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid Already Uploaded')
                    `;
                    await new Promise((resolve, reject) => {
                        pool.query(dublicateQuery)
                            .then(result => {
                                resolve(result);
                            })
                            .catch(error => {
                                reject(error);
                            });
                    });
                }

                // Processing Subject
                try {
                    let doc_subject = row[1].trim();
                    if (!doc_subject || doc_subject == "") {
                        await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_subject')`)
                        continue
                    } else {
                        document.doc_subject = doc_subject;
                    }
                } catch (err) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_subject')`)
                    continue
                }

                // Processing Doc Type
                try {
                    let doc_type = row[2].trim();
                    if (!doc_type || doc_type == "") {
                        await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_type')`)
                        continue
                    } else {
                        document.doc_type = doc_type;
                    }
                } catch (err) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs VALUES (excel_log_import_id, excel_log_row_id, excel_log_status)
                    VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_type')`)
                    continue
                }

                // Processing PDF
                const pdfLink = row[3].trim();
                if (pdfLink && pdfLink.endsWith('.pdf')) {
                    try {
                        const pdfFilePath = path.join(pdfDirectory, pdfLink);
                        const pdfBuffer = fs.readFileSync(pdfFilePath);

                        if (!pdfBuffer) {
                            await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                                             VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_pdf_path')`);
                            continue;
                        } else {
                            document.pdf_buffer = pdfBuffer;
                        }
                    } catch (error) {
                        console.log(error)
                        await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_pdf_path')`);
                        continue;
                    }
                } else {
                    await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_pdf_path')`);
                    continue;
                }

                // Processing Date
                try {
                    let doc_created_at = row[4].trim();
                    let parsedDate = moment(doc_created_at, ['DD/MM/YYYY', 'DD.MM.YYYY', 'DD-MM-YYYY'], true);
                    if (!parsedDate.isValid()) {
                        await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_created_at')`);
                        continue;
                    } else {
                        let formattedDate = parsedDate.format('DD/MM/YYYY');
                        document.doc_created_at = formattedDate;
                    }
                } catch (err) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid doc_created_at')`);
                    continue;
                }

                // Processing Storage Location
                try {
                    let doc_storage_location = row[5].trim();
                    if (doc_storage_location) {
                        document.doc_storage_location = doc_storage_location;
                    }
                } catch (err) {

                }

                // Processing Doc Reference
                try {
                    let doc_reference = row[6].trim();
                    if (doc_reference) {
                        document.doc_reference = doc_reference;
                    }
                } catch (err) {

                }

                // Processing From
                try {
                    let doc_from = row[7].trim();
                    if (doc_from) {
                        document.doc_from = doc_from;
                    }
                } catch (err) {

                }

                // Processing To
                try {
                    let doc_to = row[8].trim();
                    if (doc_to) {
                        document.doc_to = doc_to;
                    }
                } catch (err) {

                }

                // Processing Document Purpose
                try {
                    let doc_purpose = row[9].trim();
                    if (doc_purpose) {
                        document.doc_purpose = doc_purpose;
                    }
                } catch (err) {

                }


                // Uploading PDF to aws
                const fileName = uuidv4();
                const s3Params = {
                    Bucket: "spsingla-docs",
                    Key: `docs/${fileName}.pdf`,
                    Body: document.pdf_buffer,
                    ContentType: "application/pdf",
                };

                const s3Response = await s3.upload(s3Params).promise();
                const pdfLocation = s3Response.Location;
                delete document.pdf_buffer;

                if (!pdfLocation) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid Upload Failed')`);
                    continue;
                }

                const currentDate = moment().format('MM/DD/YYYY');
                document.doc_site = inputs.doc_site;
                document.doc_folder = inputs.doc_folder;
                document.doc_uploaded_by = token.user_name;
                document.doc_uploaded_by_id = token.user_id;
                document.doc_uploaded_at = currentDate;
                document.doc_source = "SHEETS";
                document.doc_pdf_link = pdfLocation;

                const insertKeys = Object.keys(document);
                const insertValues = Object.values(document);

                // Inserting document in table
                const documentQuery = {
                    text: `
                        INSERT INTO documents (${insertKeys.join(', ')}, doc_status) 
                        VALUES (${insertKeys.map((_, i) => `$${i + 1}`).join(', ')}, 'UPLOADED')
                        ON CONFLICT (doc_number) DO NOTHING;
                    `,
                    values: insertValues
                };

                const promise = new Promise(async (resolve, reject) => {
                    try {
                        const res = await pool.query(documentQuery);
                        resolve(res.rows);
                    } catch (error) {
                        reject(error);
                    }
                });

                const insertedDocumentResult = await promise;

                // Inserting Error 
                if (!insertedDocumentResult) {
                    await pool.query(`INSERT INTO doc_excel_imports_logs (excel_log_import_id, excel_log_row_id, excel_log_status)
                         VALUES ('${uploadBatchId.excel_id}', '${i}', 'Invalid Query Failed')`);
                    continue;
                }

                // Mainting site record for site_record_value
                if (document.doc_type == "OUTGOING") {
                    let updateSiteRecordQuery = `
                    UPDATE sites
                    SET site_record_value = site_record_value + 1
                    WHERE site_name = '${document.doc_folder}';
                `;
                    await pool.query(updateSiteRecordQuery);
                }
                // Replied Vide
                let references = document.doc_reference?.split(',');
                if (references?.length === 1 && references[0] !== "") {
                    references = [document.doc_reference];
                }

                const updateQuery = `
                UPDATE documents
                SET doc_replied_vide = CASE
                                            WHEN doc_replied_vide IS NULL THEN $1
                                            WHEN $1 = ANY(string_to_array(doc_replied_vide, ', ')) THEN doc_replied_vide
                                            ELSE doc_replied_vide || ', ' || $1
                                        END
                WHERE doc_number = ANY($2);`;

                await pool.query(updateQuery, [document.doc_number, references]);

                await pool.query(`
                    UPDATE doc_excel_imports
                    SET excel_batch_progress = CAST(excel_batch_progress AS INTEGER) + 1
                    WHERE excel_id = ${uploadBatchId.excel_id}
                    RETURNING *;
                `);
            }
            await pool.query(`
                    UPDATE doc_excel_imports
                    SET excel_status = 'UPLOADED'
                    WHERE excel_id = ${uploadBatchId.excel_id}
                    RETURNING *;
                `);
        } catch (err) {
            await pool.query(`
                    UPDATE doc_excel_imports
                    SET excel_status = 'FAILED',
                    excel_error_log = '${err}'
                    WHERE excel_id = ${uploadBatchId.excel_id}
                    RETURNING *;
                `);
        }

    } catch (err) {
        console.error(err);
    }
};


function selectExcelFile() {
    return new Promise((resolve, reject) => {
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (!mainWindow) reject(false);

        dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Excel files', extensions: ['xlsx'] }]
        }).then(result => {
            const selectedFilePath = result.filePaths[0];
            if (!selectedFilePath) {
                reject(false);
                return;
            }

            fs.readFile(selectedFilePath, (err, data) => {
                if (err) {
                    reject(false);
                    return;
                }
                resolve({ data, selectedFilePath });
            });
        }).catch(err => {
            reject(false);
        });
    });
}



module.exports = documentController;