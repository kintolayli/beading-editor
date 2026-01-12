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
     * @param {number|null} renderData.hoveredRow - номер выделенного ряда (для peyote - столбец, для brick - строка)
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
            gridOffsetY = 0,
            hoveredRow = null,
            hoveredBead = null,
            fillThreshold = 0.75
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
            gridOffsetY,
            hoveredRow,
            fillThreshold
        });
        
        // Выделение ряда при наведении
        if (hoveredRow !== null && (gridType === 'peyote' || gridType === 'brick')) {
            this.highlightRow({
                gridWidth,
                gridHeight,
                pixelWidthPx,
                pixelHeightPx,
                canvasWidth,
                canvasHeight,
                workspaceWidthMM,
                workspaceHeightMM,
                gridType,
                gridOffsetX,
                gridOffsetY,
                hoveredRow
            });
        }
        
        // Выделение конкретной бисеринки при наведении
        if (hoveredBead !== null) {
            this.highlightBead({
                pixelWidthPx,
                pixelHeightPx,
                canvasWidth,
                canvasHeight,
                workspaceWidthMM,
                workspaceHeightMM,
                gridType,
                gridOffsetX,
                gridOffsetY,
                hoveredBead
            });
        }
        
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
            gridOffsetY = 0,
            fillThreshold = 0.75
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
                    // Peyote: нечётные столбцы смещаются на половину высоты вниз
                    return {
                        x: 0,
                        y: (col % 2 === 1) ? pixelHeightPx / 2 : 0
                    };
                case 'brick':
                    // Brick: нечётные ряды смещаются на половину ширины вправо
                    return {
                        x: (row % 2 === 1) ? pixelWidthPx / 2 : 0,
                        y: 0
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
                
                // Вычисляем площадь пересечения бисеринки с фигурой
                // Создаем сетку точек внутри бисеринки для подсчета процента заполнения
                const sampleGridSize = 5; // Уменьшено с 10 до 5 (25 точек вместо 100) для производительности
                let filledPoints = 0;
                let totalPoints = 0;
                
                for (let sy = 0; sy < sampleGridSize; sy++) {
                    for (let sx = 0; sx < sampleGridSize; sx++) {
                        // Координаты точки внутри бисеринки (от 0.05 до 0.95, чтобы не попадать на границы)
                        const sampleOffsetX = 0.05 + (sx / (sampleGridSize - 1)) * 0.9;
                        const sampleOffsetY = 0.05 + (sy / (sampleGridSize - 1)) * 0.9;
                        
                        // Нормализованные координаты точки относительно рабочей области
                        const workspaceX = (x + pixelWidthPx * sampleOffsetX) / canvasWidth;
                        const workspaceY = (y + pixelHeightPx * sampleOffsetY) / canvasHeight;
                        
                        // Преобразуем координаты рабочей области в координаты файла
                        let fileX = workspaceX;
                        let fileY = workspaceY;
                        
                        if (hasLoadedFile && fileWidthMM && fileHeightMM) {
                            // Преобразуем координаты рабочей области в координаты файла
                            // ИСПРАВЛЕНО: используем offsetX/offsetY (смещение файла), а не sampleOffsetX/Y
                            fileX = (workspaceX - offsetX) / scaleX;
                            fileY = (workspaceY - offsetY) / scaleY;
                            
                            // НЕ пропускаем точки вне файла - originalDrawing сам обработает масштабирование
                            // При масштабировании > 1 координаты могут выходить за [0, 1], но originalDrawing
                            // правильно преобразует их обратно к исходному масштабу
                        }
                        
                        totalPoints++;
                        
                        // Проверяем, заполнена ли точка (используем координаты файла)
                        // originalDrawing сам обработает масштабирование и вернет false для точек вне исходной формы
                        const isFilled = originalDrawing(fileX, fileY);
                        if (isFilled) {
                            filledPoints++;
                        }
                    }
                }
                
                // Вычисляем процент заполнения
                const fillPercentage = totalPoints > 0 ? filledPoints / totalPoints : 0;
                
                // Бисеринка считается заполненной, если процент заполнения >= порога
                // Для порога 0 требуется fillPercentage > 0 (хотя бы частичное заполнение)
                // Для других порогов используем точное сравнение
                const isFilled = fillThreshold === 0 
                    ? fillPercentage > 0 
                    : fillPercentage >= fillThreshold;
                
                // Если все точки вне файла, рисуем только границу
                if (totalPoints === 0) {
                    ctx.strokeStyle = 'rgba(0, 255, 157, 0.15)';
                    ctx.lineWidth = 0.5;
                    this.drawBead(ctx, x, y, pixelWidthPx, pixelHeightPx, gridType, false);
                    continue;
                }
                
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
     * Выделяет ряд при наведении мыши
     * @param {Object} params - параметры отрисовки
     */
    highlightRow(params) {
        const {
            gridWidth,
            gridHeight,
            pixelWidthPx,
            pixelHeightPx,
            canvasWidth,
            canvasHeight,
            workspaceWidthMM,
            workspaceHeightMM,
            gridType,
            gridOffsetX,
            gridOffsetY,
            hoveredRow
        } = params;
        
        const ctx = this.ctx;
        const gridOffsetPxX = (gridOffsetX / workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (gridOffsetY / workspaceHeightMM) * canvasHeight;
        
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
        ctx.lineWidth = 2;
        
        if (gridType === 'peyote') {
            // Выделяем столбец (вертикальный ряд)
            // В peyote: нечётные столбцы смещаются вниз на половину высоты
            const col = hoveredRow;
            const offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
            const startX = col * pixelWidthPx + gridOffsetPxX;
            
            // Вычисляем область выделения для всего столбца
            const startY = gridOffsetPxY + offsetPxY;
            const endY = gridHeight * pixelHeightPx + gridOffsetPxY + offsetPxY;
            
            ctx.fillRect(startX, startY, pixelWidthPx, endY - startY);
            ctx.strokeRect(startX, startY, pixelWidthPx, endY - startY);
            
        } else if (gridType === 'brick') {
            // Выделяем строку (горизонтальный ряд)
            // В brick: нечётные строки смещаются вправо на половину ширины
            const row = hoveredRow;
            const offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
            const startY = row * pixelHeightPx + gridOffsetPxY;
            
            // Вычисляем область выделения для всей строки
            const startX = gridOffsetPxX + offsetPxX;
            const endX = gridWidth * pixelWidthPx + gridOffsetPxX + offsetPxX;
            
            ctx.fillRect(startX, startY, endX - startX, pixelHeightPx);
            ctx.strokeRect(startX, startY, endX - startX, pixelHeightPx);
        }
        
        ctx.restore();
    }
    
    /**
     * Выделяет конкретную бисеринку при наведении мыши
     * @param {Object} params - параметры отрисовки
     */
    highlightBead(params) {
        const {
            pixelWidthPx,
            pixelHeightPx,
            canvasWidth,
            canvasHeight,
            workspaceWidthMM,
            workspaceHeightMM,
            gridType,
            gridOffsetX,
            gridOffsetY,
            hoveredBead
        } = params;
        
        if (!hoveredBead) return;
        
        const { row, col } = hoveredBead;
        
        const ctx = this.ctx;
        ctx.save();
        
        // Преобразуем смещение из мм в пиксели
        const gridOffsetPxX = (gridOffsetX / workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (gridOffsetY / workspaceHeightMM) * canvasHeight;
        
        // Вычисляем позицию бисеринки с учётом смещения сетки
        let x, y;
        if (gridType === 'peyote') {
            const offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
            x = col * pixelWidthPx + gridOffsetPxX;
            y = row * pixelHeightPx + offsetPxY + gridOffsetPxY;
        } else {
            const offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
            x = col * pixelWidthPx + offsetPxX + gridOffsetPxX;
            y = row * pixelHeightPx + gridOffsetPxY;
        }
        
        // Размер скругления
        const cornerRadius = Math.min(pixelWidthPx, pixelHeightPx) * 0.2;
        const padding = 2;
        
        // Рисуем выделение бисеринки (только для заполненных)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        
        // Скруглённый прямоугольник
        ctx.beginPath();
        ctx.roundRect(
            x + padding,
            y + padding,
            pixelWidthPx - padding * 2,
            pixelHeightPx - padding * 2,
            cornerRadius
        );
        ctx.stroke();
        
        ctx.restore();
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
