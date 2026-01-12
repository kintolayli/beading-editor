const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // В продакшене можно добавить отправку отчета об ошибке
});

// Обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.ico') // Раскомментируйте, если добавите иконку
    })

    // Убираем стандартное меню (Файл, Правка...), чтобы выглядело чисто
    win.setMenuBarVisibility(false)

    // Загружаем ваш html файл
    win.loadFile('index.html')

    // Опционально: открыть DevTools для отладки (закомментируйте в продакшене)
    // win.webContents.openDevTools()
}

// Обработчик для диалога сохранения
ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(options)
    return result
})

// Обработчик для сохранения файла
ipcMain.handle('save-file', async (event, filePath, data) => {
    try {
        fs.writeFileSync(filePath, data, 'utf8')
        return { success: true }
    } catch (error) {
        return { success: false, error: error.message }
    }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
