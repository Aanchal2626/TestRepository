const { pool } = require("../helpers/database.helpers");
const renderController = {};

renderController.renderDashboard = async (req, res) => {
    let token = req.session.token;
    res.render("dashboard.ejs", { token });
};

renderController.renderDocuments = async (req, res) => {
    let token = req.session.token;
    res.render("documents.ejs", { token });
}

renderController.createDocument = async (req, res) => {
    let token = req.session.token;

    try {
        let siteQuery, folderQuery;
        if (token.user_role === "0") {
            siteQuery = `SELECT * FROM sites WHERE site_parent_id = 0`;
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE s.site_parent_id != 0
                ORDER BY s.site_name`;
        } else {
            siteQuery = `
                SELECT s.*
                FROM sites s
                JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
                WHERE usj.usj_user_id = ${token.user_id} AND site_parent_id = 0
            `;
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE usj.usj_user_id = ${token.user_id} AND s.site_parent_id != 0
                ORDER BY s.site_name
            `;
        }

        let siteFromDb = await pool.query(siteQuery);
        let folderFromDb = await pool.query(folderQuery);
        let sites = siteFromDb.rows;
        let folders = folderFromDb.rows;
        res.render("create-document.ejs", { token, sites, folders });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}

renderController.renderSingleDocument = async (req, res) => {
    let token = req.session.token;
    let doc_number = req.params.id;
    doc_number = Buffer.from(doc_number, 'base64').toString('utf-8');
    try {
        let siteQuery, folderQuery, documentQuery;
        documentQuery = `SELECT * FROM documents WHERE doc_number = '${doc_number}'`;
        let documentData = await pool.query(documentQuery);
        documentData = documentData.rows[0];
        delete documentData.doc_ocr_content;

        // Checking if user have permission for this document
        if (token.user_role != 0) {
            let permissionQuery = `SELECT s.*
            FROM sites s
            JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
            WHERE usj.usj_user_id = ${token.user_id}`;
            let permittedSites = await pool.query(permissionQuery);
            permittedSites = permittedSites.rows;
            const isFolderPermitted = permittedSites.some(site => site.site_name === documentData.doc_folder);
            if (!isFolderPermitted) {
                res.render("error-404")
            }
        }
        if (token.user_role === "0") {
            siteQuery = `SELECT * FROM sites WHERE site_parent_id = 0`;
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE s.site_parent_id != 0
                ORDER BY s.site_name`;
        } else {
            siteQuery = `
                SELECT s.*
                FROM sites s
                JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
                WHERE usj.usj_user_id = ${token.user_id} AND site_parent_id = 0
            `;
            folderQuery = `
                SELECT s.*, sp.site_name as site_parent_name
                FROM sites s
                JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
                LEFT JOIN sites sp ON s.site_parent_id = sp.site_id
                WHERE usj.usj_user_id = ${token.user_id} AND s.site_parent_id != 0
                ORDER BY s.site_name
            `;
        }

        let siteFromDb = await pool.query(siteQuery);
        let folderFromDb = await pool.query(folderQuery);
        let sites = siteFromDb.rows;
        let folders = folderFromDb.rows;
        res.render("edit-document.ejs", { token, sites, folders });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}


module.exports = renderController;