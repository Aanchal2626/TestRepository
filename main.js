const { app, BrowserWindow } = require('electron');
const path = require('path');
require('electron-reload')(__dirname);



// Electron app setup
let mainWindow;

app.on('ready', () => {
    // Create the main Electron window
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, './app/index.html'));

    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        expressServer.close();
        app.quit();
    });
});

// Quit app when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Activate app (macOS)
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
