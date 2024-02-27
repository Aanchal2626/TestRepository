const { pool } = require("../helpers/database.helpers");
const renderController = {};

renderController.renderNotFound = async (req, res) => {
    res.render("404.ejs");
}
renderController.renderDashboard = async (req, res) => {
    let token = req.session.token;
    const isElectron = req.get('User-Agent').includes('Electron');
    if (isElectron) {
        return res.redirect("/documents/import/excel");
    }
    if (token.user_role === "0") {
        siteQuery = `SELECT * FROM sites WHERE site_parent_id = 0`;
    } else {
        siteQuery = `
            SELECT s.*
            FROM sites s
            JOIN users_sites_junction usj ON s.site_id = usj.usj_site_id
            WHERE usj.usj_user_id = ${token.user_id} AND site_parent_id = 0
        `;
    }

    let { rows: sites } = await pool.query(siteQuery);

    res.render("dashboard.ejs", { token, sites });
};

renderController.renderDocuments = async (req, res) => {
    let token = req.session.token;
    res.render("documents.ejs", { token });
};

renderController.renderUsers = async (req, res) => {
    let token = req.session.token;
    try {
        let query = `SELECT * FROM users WHERE user_role != 0`;
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
        documentQuery = `SELECT d.*, 
                                string_agg(j.doc_junc_number, ', ') AS doc_replied_vide
                        FROM documents d
                        LEFT JOIN doc_reference_junction j ON j.doc_junc_replied = d.doc_number
                        WHERE d.doc_number = '${doc_number}'
                        GROUP BY d.doc_id`;
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

renderController.renderEmailImport = async (req, res) => {
    let token = req.session.token;
    res.render("email-import.ejs", { token })
};

renderController.renderExcelImport = async (req, res) => {
    let token = req.session.token;
    let miscData = await pool.query(`SELECT * FROM misc WHERE misc_id = 1`);

    if (miscData) {
        miscData.format_link = miscData.rows[0].misc_format_link;
        miscData.app_link = miscData.rows[0].misc_app_link;
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
    const isElectron = req.get('User-Agent').includes('Electron');
    res.render("excel-import.ejs", { token, miscData, isElectron, sites, folders })
};

module.exports = renderController;