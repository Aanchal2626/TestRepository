const app = require('electron').app;
const Window = require('electron').BrowserWindow;
const server = require('./index');

let mainWindow = null;

app.on('ready', function () {
    mainWindow = new Window({
        width: 1280,
        height: 1024,
        autoHideMenuBar: false,
        useContentSize: true,
        resizable: true,
    });
    mainWindow.loadURL('http://localhost:4000/');

    mainWindow.focus();
});

app.on('window-all-closed', function () {
    app.quit();
});