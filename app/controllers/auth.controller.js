let { pool } = require("../helpers/database.helpers");
const authController = {};


authController.login = async (req, res) => {
    try {
        let inputs = req.body;

        if (!inputs.user_email) {
            return res.send({ status: 0, msg: "Invalid Email" });
        }

        if (!inputs.user_password) {
            return res.send({ status: 0, msg: "Invalid Password" });
        }

        let result = await pool.query(`SELECT * FROM users WHERE user_email = $1`, [inputs.user_email]);

        if (result.rows.length == 0) {
            return res.send({ status: 0, msg: "User not found" });
        }

        let user = result.rows[0];

        if (!user.user_status) {
            return res.send({ status: 0, msg: "User Suspended" })
        }

        if (inputs.user_password != user.user_password) {
            return res.send({ status: 0, msg: "Incorrect Password" });
        }

        delete user.user_password;

        req.session.token = user;

        res.send({ status: 1, msg: "Login successful" });

    } catch (err) {
        res.send({ status: 0, msg: "Internal Server Error" });
        console.error(err);
    }
};

module.exports = authController;