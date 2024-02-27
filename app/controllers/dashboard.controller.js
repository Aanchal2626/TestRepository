const { pool } = require("../helpers/database.helpers");
let dashboardController = {};

dashboardController.getSiteStats = async (req, res) => {
    try {
        let token = req.session.token;
        let inputs = req.body;
        let folderQuery = "";
        let queryParams = [];

        if (token.user_role == "0") {
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE s.site_parent_id = $1
                ORDER BY s.site_name`;
            queryParams.push(inputs.site_id);
        } else {
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE usj.usj_user_id = $1 AND s.site_parent_id = $2
                ORDER BY s.site_name
            `;
            queryParams = [token.user_id, inputs.site_id];
        }
        let { rows: folders } = await pool.query(folderQuery, queryParams);
        const documentStatsPerFolder = [];

        for (const folder of folders) {
            let documentStats = { totalDocuments: 0, draftedDocuments: 0, uploadedDocuments: 0, pagesUploaded: 0 };

            try {
                let { rows: totalDocuments } = await pool.query(`SELECT COUNT(*) FROM documents WHERE doc_folder = $1`, [folder.site_name]);
                documentStats.totalDocuments = totalDocuments[0]?.count || '0';

                let { rows: draftedDocuments } = await pool.query(`SELECT COUNT(*) FROM documents WHERE doc_folder = $1 AND doc_status = 'DRAFTED'`, [folder.site_name]);
                documentStats.draftedDocuments = draftedDocuments[0]?.count || '0';

                let { rows: uploadedDocuments } = await pool.query(`SELECT COUNT(*) FROM documents WHERE doc_folder = $1 AND doc_status = 'UPLOADED'`, [folder.site_name]);
                documentStats.uploadedDocuments = uploadedDocuments[0]?.count || '0';

                let { rows: pagesSum } = await pool.query(`SELECT SUM(dm_ocr_pages::int) AS pages_uploaded FROM doc_metadata WHERE dm_folder_name = $1`, [folder.site_name]);
                documentStats.pagesUploaded = pagesSum[0]?.pages_uploaded || '0';

                documentStatsPerFolder.push({ siteName: folder.site_name, stats: documentStats });
            } catch (error) {
                console.error(error);
                return res.send({ status: 0, msg: "Something went wrong" });
            }
        }
        res.send({ status: 1, documentStatsPerFolder });
    } catch (err) {
        console.error(err);
        res.send({ status: 0, msg: "Something went wrong" });
    }
}
module.exports = dashboardController;