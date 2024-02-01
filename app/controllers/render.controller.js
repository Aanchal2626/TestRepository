const renderController = {};

renderController.renderDashboard = async (req, res) => {
    let token = req.session.token;
    console.log(token)
    res.send("Home Page")
};

module.exports = renderController;