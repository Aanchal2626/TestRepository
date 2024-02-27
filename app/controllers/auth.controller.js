const { pool } = require("../helpers/database.helpers");
const moment = require("moment");
const authController = {};

authController.sendResetOTP = async (req, res) => {
    try {
        let inputs = req.body;

        if (!inputs.user_email) {
            return res.send({ status: 0, msg: "Invalid Email" })
        }

        let result = await pool.query(`SELECT * FROM users WHERE user_email = $1`, [inputs.user_email]);

        if (result.rows.length == 0) {
            return res.send({ status: 0, msg: "User not found" });
        }

        let user = result.rows[0];

        if (!user.user_status) {
            return res.send({ status: 0, msg: "User Suspended" })
        }

        let otpExpireTimestamp = moment().add(5, 'minutes').unix();

        console.log(otpExpireTimestamp)
    } catch (err) {
        console.log(err)
        res.send({ status: 0, msg: "Something Went Wrong" });
    }
}

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
        res.send({ status: 0, msg: "Internal Server Error", error: { test: "err", test1: err } });
        console.error(err);
    }
};

authController.logout = async (req, res) => {
    req.session.destroy();
    res.redirect("/");
}

module.exports = authController;