const { app, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require("dotenv").config();

const expressApp = require('./your_express_app');

const expressServer = expressApp.listen(3000, () => {
    console.log('Express server running on port 3000');
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    mainWindow.loadURL('http://localhost:3000');
}
app.whenReady().then(createWindow);
