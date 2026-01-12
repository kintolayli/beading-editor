/**
 * Модуль для отрисовки на canvas
 */
class CanvasRenderer {
    /**
     * @param {CanvasRenderingContext2D} ctx - контекст canvas
     */
    constructor(ctx) {
        this.ctx = ctx;
    }
    
    /**
     * Отрисовывает весь canvas
     * @param {Object} renderData - данные для отрисовки
     * @param {number} renderData.canvasWidth - ширина canvas
     * @param {number} renderData.canvasHeight - высота canvas
     * @param {number} renderData.workspaceWidthMM - ширина рабочей области в мм
     * @param {number} renderData.workspaceHeightMM - высота рабочей области в мм
     * @param {number} renderData.pixelWidthMM - ширина пикселя в мм
     * @param {number} renderData.pixelHeightMM - высота пикселя в мм
     * @param {Function} renderData.originalDrawing - функция проверки заполнения пикселя
     * @param {Array} renderData.contour - массив точек контура
     * @param {boolean} renderData.hasLoadedFile - загружен ли файл
     * @param {number|null} renderData.fileWidthMM - ширина файла в мм
     * @param {number|null} renderData.fileHeightMM - высота файла в мм
     */
    render(renderData) {
        const {
            canvasWidth,
            canvasHeight,
            workspaceWidthMM,
            workspaceHeightMM,
            pixelWidthMM,
            pixelHeightMM,
            originalDrawing,
            contour,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM
        } = renderData;
        
        // Очистка
        this.ctx.fillStyle = '#0a0e17';
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Вычисляем количество пикселей и их размеры в экранных координатах
        const gridWidth = Math.max(1, Math.floor(workspaceWidthMM / pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(workspaceHeightMM / pixelHeightMM));
        
        const pixelWidthPx = canvasWidth / gridWidth;
        const pixelHeightPx = canvasHeight / gridHeight;
        
        // Отрисовка пиксельной сетки и рисунка
        this.renderPixelGrid({
            gridWidth,
            gridHeight,
            pixelWidthPx,
            pixelHeightPx,
            workspaceWidthMM,
            workspaceHeightMM,
            originalDrawing,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM
        });
        
        // Отрисовка контура
        this.renderContour({
            canvasWidth,
            canvasHeight,
            contour,
            workspaceWidthMM,
            workspaceHeightMM,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM
        });
    }
    
    /**
     * Отрисовывает пиксельную сетку
     * @param {Object} params - параметры отрисовки
     */
    renderPixelGrid(params) {
        const {
            gridWidth,
            gridHeight,
            pixelWidthPx,
            pixelHeightPx,
            workspaceWidthMM,
            workspaceHeightMM,
            originalDrawing,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM
        } = params;
        
        const ctx = this.ctx;
        
        // Вычисляем масштаб для преобразования координат файла в координаты рабочей области
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (hasLoadedFile && fileWidthMM && fileHeightMM) {
            // Масштаб: размер файла относительно рабочей области
            scaleX = fileWidthMM / workspaceWidthMM;
            scaleY = fileHeightMM / workspaceHeightMM;
            // Центрируем файл в рабочей области
            offsetX = (1.0 - scaleX) / 2.0;
            offsetY = (1.0 - scaleY) / 2.0;
        }
        
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                // Нормализованные координаты центра пикселя относительно рабочей области
                const workspaceX = (col + 0.5) / gridWidth;
                const workspaceY = (row + 0.5) / gridHeight;
                
                // Преобразуем координаты рабочей области в координаты файла
                let fileX = workspaceX;
                let fileY = workspaceY;
                
                if (hasLoadedFile && fileWidthMM && fileHeightMM) {
                    // Преобразуем координаты рабочей области в координаты файла
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;
                    
                    // Проверяем, находится ли пиксель в пределах файла
                    if (fileX < 0 || fileX > 1 || fileY < 0 || fileY > 1) {
                        // Пиксель вне файла - не закрашиваем
                        ctx.strokeStyle = 'rgba(0, 255, 157, 0.15)';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(col * pixelWidthPx, row * pixelHeightPx, pixelWidthPx, pixelHeightPx);
                        continue;
                    }
                }
                
                // Проверяем, должен ли пиксель быть закрашен (используем координаты файла)
                const isFilled = originalDrawing(fileX, fileY);
                
                // Экранные координаты
                const x = col * pixelWidthPx;
                const y = row * pixelHeightPx;
                
                // Отрисовка пикселя
                if (isFilled) {
                    ctx.fillStyle = 'rgba(0, 255, 157, 0.8)';
                    ctx.fillRect(x, y, pixelWidthPx, pixelHeightPx);
                }
                
                // Отрисовка границ пикселя
                ctx.strokeStyle = 'rgba(0, 255, 157, 0.15)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, pixelWidthPx, pixelHeightPx);
            }
        }
    }
    
    /**
     * Отрисовывает контур
     * @param {Object} params - параметры отрисовки
     */
    renderContour(params) {
        const {
            canvasWidth,
            canvasHeight,
            contour,
            workspaceWidthMM,
            workspaceHeightMM,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM
        } = params;
        
        if (!contour || contour.length === 0) {
            return;
        }
        
        const ctx = this.ctx;
        
        // Вычисляем масштаб для преобразования координат файла в координаты рабочей области
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (hasLoadedFile && fileWidthMM && fileHeightMM) {
            // Масштаб: размер файла относительно рабочей области
            scaleX = fileWidthMM / workspaceWidthMM;
            scaleY = fileHeightMM / workspaceHeightMM;
            // Центрируем файл в рабочей области
            offsetX = (1.0 - scaleX) / 2.0;
            offsetY = (1.0 - scaleY) / 2.0;
        }
        
        ctx.beginPath();
        
        contour.forEach((point, index) => {
            // Координаты точки в нормализованных координатах файла [0, 1]
            let fileX = point.x;
            let fileY = point.y;
            
            // Преобразуем координаты файла в координаты рабочей области
            let workspaceX = fileX;
            let workspaceY = fileY;
            
            if (hasLoadedFile && fileWidthMM && fileHeightMM) {
                workspaceX = offsetX + fileX * scaleX;
                workspaceY = offsetY + fileY * scaleY;
            }
            
            // Преобразуем в экранные координаты
            const x = workspaceX * canvasWidth;
            const y = workspaceY * canvasHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
