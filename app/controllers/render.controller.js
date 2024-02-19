const { pool } = require("../helpers/database.helpers");
const renderController = {};

renderController.renderDashboard = async (req, res) => {
    let token = req.session.token;
    res.render("dashboard.ejs", { token });
};

renderController.renderDocuments = async (req, res) => {
    let token = req.session.token;
    res.render("documents.ejs", { token });
};

renderController.renderUsers = async (req, res) => {
    let token = req.session.token;
    try {
        let query = `SELECT * FROM users`;
        let users = await pool.query(query);
        users = users.rows;
        res.render("users.ejs", { token, users });
    } catch (err) {
        console.log(err)
    }
};

renderController.renderSites = async (req, res) => {
    let token = req.session.token;
    try {
        let query = `SELECT * FROM sites ORDER BY site_id ASC;`;
        let permissionsQuery = `
        SELECT users_sites_junction.*, users.user_name
        FROM users_sites_junction
        LEFT JOIN users ON users_sites_junction.usj_user_id = users.user_id;`
        let usersQuery = `SELECT user_id,user_name FROM users WHERE user_role != 0`;
        let { rows: sites } = await pool.query(query);
        let { rows: permissions } = await pool.query(permissionsQuery);
        let { rows: users } = await pool.query(usersQuery);
        res.render("sites.ejs", { token, sites, permissions, users });
    } catch (err) {
        console.log(err)
    }
};

renderController.renderCreateDocument = async (req, res) => {
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
        let documentData = [];
        res.render("create-document.ejs", { token, sites, folders, documentData });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
};

renderController.renderSingleDocument = async (req, res) => {
    let token = req.session.token;
    try {
        let siteQuery, folderQuery, documentQuery;
        let doc_number = Buffer.from(req.params.id, 'base64').toString('utf-8');
        documentQuery = `SELECT * FROM documents WHERE doc_number = '${doc_number}'`;
        let documentData = await pool.query(documentQuery);
        documentData = documentData.rows[0];

        if (!documentData) return res.render("404")
        if (token.user_role != 0) {
            if (documentData.doc_confidential) {

            }
            let permissionQuery = `SELECT s.*
            FROM sites s
            JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
            WHERE usj.usj_user_id = ${token.user_id}`;
            let permittedSites = await pool.query(permissionQuery);
            permittedSites = permittedSites.rows;
            const isFolderPermitted = permittedSites.some(site => site.site_name === documentData.doc_folder);
            if (!isFolderPermitted) {
                return res.render("404")
            }
        }

        if (documentData.doc_status == "UPLOADED") {
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
            res.render("view-document.ejs", { token, sites, folders, documentData });
        } else {
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

            res.render("create-document.ejs", { token, sites, folders, documentData });
        }
    } catch (error) {
        console.error(error);
        res.send("Internal Server Error");
    }
};

renderController.renderImportDocument = async (req, res) => {
    let token = req.session.token;
    res.render("import.ejs", { token })
};

module.exports = renderController;