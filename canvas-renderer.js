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
     * @param {string} renderData.gridType - тип сетки ('square', 'peyote', 'brick')
     * @param {number} renderData.gridOffsetX - смещение сетки по X в мм
     * @param {number} renderData.gridOffsetY - смещение сетки по Y в мм
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
            fileHeightMM,
            gridType = 'square',
            gridOffsetX = 0,
            gridOffsetY = 0
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
            canvasWidth,
            canvasHeight,
            workspaceWidthMM,
            workspaceHeightMM,
            originalDrawing,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM,
            gridType,
            gridOffsetX,
            gridOffsetY
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
            canvasWidth,
            canvasHeight,
            workspaceWidthMM,
            workspaceHeightMM,
            originalDrawing,
            hasLoadedFile,
            fileWidthMM,
            fileHeightMM,
            gridType = 'square',
            gridOffsetX = 0,
            gridOffsetY = 0
        } = params;
        
        const ctx = this.ctx;
        
        // Преобразуем смещение из мм в пиксели экрана
        const gridOffsetPxX = (gridOffsetX / workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (gridOffsetY / workspaceHeightMM) * canvasHeight;
        
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
        
        // Смещение для разных типов сеток
        const getOffset = (row, col) => {
            switch (gridType) {
                case 'peyote':
                    // Peyote: нечётные ряды смещаются на половину ширины вправо
                    return {
                        x: (row % 2 === 1) ? pixelWidthPx / 2 : 0,
                        y: 0
                    };
                case 'brick':
                    // Brick: нечётные столбцы смещаются на половину высоты вниз
                    return {
                        x: 0,
                        y: (col % 2 === 1) ? pixelHeightPx / 2 : 0
                    };
                default:
                    return { x: 0, y: 0 };
            }
        };
        
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                const offset = getOffset(row, col);
                
                // Экранные координаты с учётом смещения сетки и типа сетки
                const x = col * pixelWidthPx + offset.x + gridOffsetPxX;
                const y = row * pixelHeightPx + offset.y + gridOffsetPxY;
                
                // Пропускаем бисеринки, которые полностью выходят за границы
                if (x >= canvasWidth || y >= canvasHeight) {
                    continue;
                }
                
                // Нормализованные координаты центра пикселя относительно рабочей области
                const workspaceX = (x + pixelWidthPx / 2) / canvasWidth;
                const workspaceY = (y + pixelHeightPx / 2) / canvasHeight;
                
                // Преобразуем координаты рабочей области в координаты файла
                let fileX = workspaceX;
                let fileY = workspaceY;
                
                if (hasLoadedFile && fileWidthMM && fileHeightMM) {
                    // Преобразуем координаты рабочей области в координаты файла
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;
                    
                    // Проверяем, находится ли пиксель в пределах файла
                    if (fileX < 0 || fileX > 1 || fileY < 0 || fileY > 1) {
                        // Пиксель вне файла - рисуем только границу
                        ctx.strokeStyle = 'rgba(0, 255, 157, 0.15)';
                        ctx.lineWidth = 0.5;
                        this.drawBead(ctx, x, y, pixelWidthPx, pixelHeightPx, gridType, false);
                        continue;
                    }
                }
                
                // Проверяем, должен ли пиксель быть закрашен (используем координаты файла)
                const isFilled = originalDrawing(fileX, fileY);
                
                // Отрисовка бисеринки
                this.drawBead(ctx, x, y, pixelWidthPx, pixelHeightPx, gridType, isFilled);
            }
        }
    }
    
    /**
     * Отрисовывает одну бисеринку
     * @param {CanvasRenderingContext2D} ctx - контекст canvas
     * @param {number} x - координата X
     * @param {number} y - координата Y
     * @param {number} width - ширина
     * @param {number} height - высота
     * @param {string} gridType - тип сетки
     * @param {boolean} isFilled - заполнена ли бисеринка
     */
    drawBead(ctx, x, y, width, height, gridType, isFilled) {
        const padding = 1; // Отступ между бисеринками
        const drawX = x + padding / 2;
        const drawY = y + padding / 2;
        const drawWidth = width - padding;
        const drawHeight = height - padding;
        
        if (isFilled) {
            ctx.fillStyle = 'rgba(0, 255, 157, 0.8)';
            
            // Для peyote и brick рисуем скруглённые бисеринки
            if (gridType === 'peyote' || gridType === 'brick') {
                const radius = Math.min(drawWidth, drawHeight) / 4;
                this.roundRect(ctx, drawX, drawY, drawWidth, drawHeight, radius);
                ctx.fill();
            } else {
                ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
            }
        }
        
        // Отрисовка границ
        ctx.strokeStyle = 'rgba(0, 255, 157, 0.15)';
        ctx.lineWidth = 0.5;
        
        if (gridType === 'peyote' || gridType === 'brick') {
            const radius = Math.min(drawWidth, drawHeight) / 4;
            this.roundRect(ctx, drawX, drawY, drawWidth, drawHeight, radius);
            ctx.stroke();
        } else {
            ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
        }
    }
    
    /**
     * Рисует прямоугольник со скруглёнными углами
     * @param {CanvasRenderingContext2D} ctx - контекст canvas
     * @param {number} x - координата X
     * @param {number} y - координата Y
     * @param {number} width - ширина
     * @param {number} height - высота
     * @param {number} radius - радиус скругления
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
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
