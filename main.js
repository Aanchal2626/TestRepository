const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

const expressApp = require('./server');

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const mainWindow = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true
        }
    });
    mainWindow.loadURL('http://localhost:4000');
}

app.whenReady().then(() => {
    const server = expressApp.listen(4000, () => {
        console.log('Express server is running on port 4000');
        createWindow();
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
