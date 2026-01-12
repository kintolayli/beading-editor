const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        // icon: path.join(__dirname, 'icon.ico') // Раскомментируйте, если добавите иконку
    })

    // Убираем стандартное меню (Файл, Правка...), чтобы выглядело чисто
    win.setMenuBarVisibility(false)

    // Загружаем ваш html файл
    win.loadFile('index.html')

    // Опционально: открыть DevTools для отладки (закомментируйте в продакшене)
    // win.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
