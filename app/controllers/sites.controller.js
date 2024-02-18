const { pool } = require("../helpers/database.helpers");
let userController = {};


userController.saveSite = async (req, res) => {
    try {
        const inputs = req.body;

        if (!inputs.site_name || inputs.site_name == "") {
            return res.send({ status: 0, msg: "Invalid Site Name" });
        }
        if (!inputs.site_code || inputs.site_code == "") {
            return res.send({ status: 0, msg: "Invalid Site Code" });
        }

        const query = `
        INSERT INTO sites (site_name, site_parent_id, site_code)
        VALUES ($1, $2, $3)
        ON CONFLICT (site_code)
        DO UPDATE SET
          site_name = EXCLUDED.site_name
      `;

        let updatedSite = await pool.query(query, [inputs.site_name, 0, inputs.site_code]);
        if (updatedSite) {
            res.send({ status: 1, msg: "Site saved successfully" });
        } else {
            res.send({ status: 0, msg: "Something went wrong" });
        }

    } catch (error) {
        console.error("Error saving site:", error);
        res.send({ status: 0, msg: "Something went wrong" });
    }
};

module.exports = userController;