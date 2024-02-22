const { app, BrowserWindow, screen } = require('electron');
const expressApp = require('./index');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });
require('electron-reload')(__dirname);

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const mainWindow = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true
        }
    });
    let listenString = `http://localhost:${process.env.PORT || 3000}`;
    mainWindow.loadURL(listenString);
}

app.whenReady().then(() => {
    const server = expressApp.listen(process.env.PORT || 3000, () => {
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


