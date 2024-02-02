const { pool } = require("../helpers/database.helpers");
const moment = require("moment");
const documentController = {};

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
            if (data.doc_reference) {
                data.doc_reference = JSON.stringify(data.doc_reference)
            }
            const keys = Object.keys(data);
            const nonEmptyKeys = keys.filter(key => {
                const value = data[key];
                const isEmpty = value === '' || value === null || (Array.isArray(value) && value.length === 0) || value === '[]';
                return !isEmpty;
            });

            console.log("Non-empty keys:", nonEmptyKeys);
            nonEmptyKeys.push('doc_uploaded_by', 'doc_uploaded_date');

            const currentDate = moment().format('MM/DD/YYYY');

            data['doc_uploaded_by'] = token.user_name;
            data['doc_uploaded_date'] = currentDate;
            data['doc_status'] = "Drafted";

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
        let dataFromDb = await pool.query(query);
        if (dataFromDb.rowCount == 1) {
            let updateSiteRecordQuery = `
                UPDATE site_records
                SET sr_value = sr_value + 1
                WHERE sr_id = (SELECT site_id FROM sites WHERE site_name = '${inputs.doc_folder}');
            `;
            await pool.query(updateSiteRecordQuery);
        } else {
            console.log("Document insertion conflicted.");
        }
        res.send({ status: 1, msg: "Success" })
    } catch (error) {
        console.error(error);
        res.send({ status: 0, msg: "Internal Server Error" });
    }
}



module.exports = documentController;