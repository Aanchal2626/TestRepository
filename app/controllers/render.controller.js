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
        console.log(sites)
        res.render("create-document.ejs", { token, sites, folders });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}


module.exports = renderController;