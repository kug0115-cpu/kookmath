const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Identifying this as valid for a local personal app for simplicity
        },
        // Modern clean look
        backgroundColor: '#ffffff'
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Open DevTools for debugging
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Setting up data path
const DATA_PATH = path.join(__dirname, 'data', 'books.json');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// IPC Handlers for Data Persistence
ipcMain.handle('read-data', async (event) => {
    try {
        if (!fs.existsSync(DATA_PATH)) {
            // Return empty structure if file doesn't exist
            return { grades: [] };
        }
        const data = fs.readFileSync(DATA_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data:", error);
        return { grades: [] };
    }
});

ipcMain.handle('write-data', async (event, data) => {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error("Error writing data:", error);
        return false;
    }
});
