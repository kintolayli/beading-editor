class PixelGridDemo {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Константы
        this.workspaceWidthMM = 150;  // Ширина рабочей области в мм
        this.workspaceHeightMM = 150; // Высота рабочей области в мм

        // Начальные размеры пикселя в мм
        this.pixelWidthMM = 3.125;
        this.pixelHeightMM = 3.125;

        // Тип сетки ('peyote', 'brick')
        this.gridType = 'peyote';
        
        // Смещение сетки в мм
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

        // Масштаб для SVG файлов
        this.scale = 1.0;
        this.fileType = null; // 'svg' или 'dxf'
        this.hasLoadedFile = false;

        // Размеры загруженного файла в мм (с учётом масштаба для SVG)
        this.fileWidthMM = null;
        this.fileHeightMM = null;
        
        // Исходные размеры файла (без масштаба, только для SVG)
        this.originalFileWidthMM = null;
        this.originalFileHeightMM = null;
        
        // Имя загруженного файла
        this.loadedFileName = null;

        // Исходные данные
        this.originalContour = null;
        this.originalDrawingFunction = null;
        this.contour = null;
        this.originalDrawing = null;
        
        // Состояние для оверлея рядов
        this.hoveredRow = null; // Для peyote - номер столбца, для brick - номер строки
        this.mouseX = null;
        this.mouseY = null;

        // Инициализация модулей
        this.renderer = new CanvasRenderer(this.ctx);
        this.svgLoader = new SVGLoader();
        this.dxfLoader = new DXFLoader();

        // Создание исходного рисунка (инвариантное хранение)
        this.createOriginalDrawing();

        // Инициализация UI
        this.uiController = new UIController({
            onPixelWidthChange: (value) => this.handlePixelWidthChange(value),
            onPixelHeightChange: (value) => this.handlePixelHeightChange(value),
            onWorkspaceWidthChange: (value) => this.handleWorkspaceWidthChange(value),
            onWorkspaceHeightChange: (value) => this.handleWorkspaceHeightChange(value),
            onScaleChange: (value) => this.handleScaleChange(value),
            onFileUpload: (file, extension) => this.handleFileUpload(file, extension),
            onGridTypeChange: (type) => this.handleGridTypeChange(type),
            onGridOffsetXChange: (value) => this.handleGridOffsetXChange(value),
            onGridOffsetYChange: (value) => this.handleGridOffsetYChange(value),
            onUpdateUI: () => this.updateUI()
        });

        // Настройка canvas
        this.setupCanvas();

        // Обновление UI
        this.updateUI();

        // Отслеживание изменения размера окна
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.render();
        });
        
        // Обработчики событий мыши для оверлея рядов
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

        // Первая отрисовка
        this.render();
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.mouseX = x;
        this.mouseY = y;
        
        // Определяем, в какой ряд попала мышь
        const gridWidth = Math.max(1, Math.floor(this.workspaceWidthMM / this.pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(this.workspaceHeightMM / this.pixelHeightMM));
        
        const canvasWidth = this.currentCanvasWidth || this.canvas.width;
        const canvasHeight = this.currentCanvasHeight || this.canvas.height;
        
        const pixelWidthPx = canvasWidth / gridWidth;
        const pixelHeightPx = canvasHeight / gridHeight;
        
        // Преобразуем смещение из мм в пиксели
        const gridOffsetPxX = (this.gridOffsetX / this.workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (this.gridOffsetY / this.workspaceHeightMM) * canvasHeight;
        
        let rowIndex = null;
        
        if (this.gridType === 'peyote') {
            // Для peyote определяем столбец (вертикальный ряд)
            const adjustedX = x - gridOffsetPxX;
            const col = Math.floor(adjustedX / pixelWidthPx);
            
            // Учитываем смещение peyote
            if (col >= 0 && col < gridWidth) {
                rowIndex = col;
            }
        } else if (this.gridType === 'brick') {
            // Для brick определяем строку (горизонтальный ряд)
            const adjustedY = y - gridOffsetPxY;
            const row = Math.floor(adjustedY / pixelHeightPx);
            
            // Учитываем смещение brick
            if (row >= 0 && row < gridHeight) {
                rowIndex = row;
            }
        }
        
        if (this.hoveredRow !== rowIndex) {
            this.hoveredRow = rowIndex;
            this.render();
        }
        this.updateRowOverlayInfo();
    }
    
    handleMouseLeave() {
        this.hoveredRow = null;
        this.mouseX = null;
        this.mouseY = null;
        this.render();
        this.hideRowOverlayInfo();
    }
    
    /**
     * Подсчитывает количество бисеринок в ряду
     */
    countBeadsInRow(rowIndex) {
        if (rowIndex === null || !this.originalDrawing) return 0;
        
        const gridWidth = Math.max(1, Math.floor(this.workspaceWidthMM / this.pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(this.workspaceHeightMM / this.pixelHeightMM));
        
        const canvasWidth = this.currentCanvasWidth || this.canvas.width;
        const canvasHeight = this.currentCanvasHeight || this.canvas.height;
        
        const pixelWidthPx = canvasWidth / gridWidth;
        const pixelHeightPx = canvasHeight / gridHeight;
        
        const gridOffsetPxX = (this.gridOffsetX / this.workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (this.gridOffsetY / this.workspaceHeightMM) * canvasHeight;
        
        // Вычисляем масштаб для файла
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
            scaleX = this.fileWidthMM / this.workspaceWidthMM;
            scaleY = this.fileHeightMM / this.workspaceHeightMM;
            offsetX = (1.0 - scaleX) / 2.0;
            offsetY = (1.0 - scaleY) / 2.0;
        }
        
        let count = 0;
        
        if (this.gridType === 'peyote') {
            // Для peyote проверяем все строки в столбце rowIndex
            // В peyote нечётные столбцы смещаются вниз на половину высоты
            const col = rowIndex;
            const offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
            
            for (let row = 0; row < gridHeight; row++) {
                const x = col * pixelWidthPx + gridOffsetPxX;
                const y = row * pixelHeightPx + offsetPxY + gridOffsetPxY;
                
                if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;
                
                const workspaceX = (x + pixelWidthPx / 2) / canvasWidth;
                const workspaceY = (y + pixelHeightPx / 2) / canvasHeight;
                
                let fileX = workspaceX;
                let fileY = workspaceY;
                
                if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;
                    
                    if (fileX < 0 || fileX > 1 || fileY < 0 || fileY > 1) continue;
                }
                
                if (this.originalDrawing(fileX, fileY)) {
                    count++;
                }
            }
        } else if (this.gridType === 'brick') {
            // Для brick проверяем все столбцы в строке rowIndex
            // В brick нечётные строки смещаются вправо на половину ширины
            const row = rowIndex;
            const offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
            
            for (let col = 0; col < gridWidth; col++) {
                const x = col * pixelWidthPx + offsetPxX + gridOffsetPxX;
                const y = row * pixelHeightPx + gridOffsetPxY;
                
                if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;
                
                const workspaceX = (x + pixelWidthPx / 2) / canvasWidth;
                const workspaceY = (y + pixelHeightPx / 2) / canvasHeight;
                
                let fileX = workspaceX;
                let fileY = workspaceY;
                
                if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;
                    
                    if (fileX < 0 || fileX > 1 || fileY < 0 || fileY > 1) continue;
                }
                
                if (this.originalDrawing(fileX, fileY)) {
                    count++;
                }
            }
        }
        
        return count;
    }
    
    updateRowOverlayInfo() {
        if (this.hoveredRow === null) {
            this.hideRowOverlayInfo();
            return;
        }
        
        const count = this.countBeadsInRow(this.hoveredRow);
        const rowType = this.gridType === 'peyote' ? 'столбец' : 'строка';
        const rowNumber = this.hoveredRow + 1; // Нумерация с 1 для пользователя
        
        const overlay = document.getElementById('rowOverlayInfo');
        if (overlay) {
            overlay.innerHTML = `
                <div class="row-overlay-content">
                    <div class="row-overlay-title">${rowType.toUpperCase()} ${rowNumber}</div>
                    <div class="row-overlay-count">${count} бисеринок</div>
                </div>
            `;
            overlay.style.display = 'block';
            
            // Позиционируем рядом с курсором
            if (this.mouseX !== null && this.mouseY !== null) {
                const rect = this.canvas.getBoundingClientRect();
                overlay.style.left = (rect.left + this.mouseX + 15) + 'px';
                overlay.style.top = (rect.top + this.mouseY - 10) + 'px';
            }
        }
    }
    
    hideRowOverlayInfo() {
        const overlay = document.getElementById('rowOverlayInfo');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        const aspectRatio = this.workspaceWidthMM / this.workspaceHeightMM || 1;

        // Используем весь доступный контейнер, сохраняя пропорции рабочей области
        let width = containerWidth;
        let height = width / aspectRatio;

        if (height > containerHeight) {
            height = containerHeight;
            width = height * aspectRatio;
        }

        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        this.currentCanvasWidth = width;
        this.currentCanvasHeight = height;
    }

    createOriginalDrawing() {
        // Создаём контур - сердце (по умолчанию)
        this.originalContour = this.createHeartContour();
        this.contour = this.originalContour;

        // Сбрасываем размеры файла для дефолтного рисунка
        this.fileWidthMM = null;
        this.fileHeightMM = null;
        this.originalFileWidthMM = null;
        this.originalFileHeightMM = null;
        this.loadedFileName = null;
        this.fileType = null;
        this.hasLoadedFile = false;
        this.scale = 1.0;

        // Создаём исходный рисунок в виде функции,
        // которая определяет, закрашен ли пиксель в данной нормализованной позиции
        // Нормализованные координаты: [0, 1] x [0, 1] относительно bounding box
        this.originalDrawingFunction = this.createHeartPattern();
        this.originalDrawing = this.originalDrawingFunction;
    }

    /**
     * Применяет масштаб к SVG файлу (для DXF не используется)
     */
    applyScale() {
        // Масштабирование применяется только для SVG файлов
        if (!this.hasLoadedFile || this.fileType !== 'svg' || !this.originalContour || !this.originalDrawingFunction) {
            return;
        }

        // Применяем масштаб к размерам файла
        if (this.originalFileWidthMM && this.originalFileHeightMM) {
            this.fileWidthMM = this.originalFileWidthMM * this.scale;
            this.fileHeightMM = this.originalFileHeightMM * this.scale;
        }

        // Применяем масштаб к контуру
        const centerX = 0.5;
        const centerY = 0.5;

        this.contour = this.originalContour.map(point => {
            const dx = point.x - centerX;
            const dy = point.y - centerY;
            return {
                x: centerX + dx * this.scale,
                y: centerY + dy * this.scale
            };
        });

        // Создаём масштабированную функцию рисунка
        const originalFunc = this.originalDrawingFunction;
        this.originalDrawing = (normalizedX, normalizedY) => {
            // Преобразуем координаты обратно к исходному масштабу
            const dx = normalizedX - centerX;
            const dy = normalizedY - centerY;
            const origX = centerX + dx / this.scale;
            const origY = centerY + dy / this.scale;

            // Проверяем границы
            if (origX < 0 || origX > 1 || origY < 0 || origY > 1) {
                return false;
            }

            return originalFunc(origX, origY);
        };
    }

    createHeartContour() {
        // Контур сердца в нормализованных координатах [0, 1]
        const points = [];
        const steps = 100;

        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * 2 * Math.PI;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

            // Нормализация в диапазон [0, 1]
            const normalizedX = (x + 17) / 34;
            const normalizedY = (-y + 17) / 34;

            points.push({ x: normalizedX, y: normalizedY });
        }

        return points;
    }

    createHeartPattern() {
        // Создаём паттерн - градиентное заполнение с диагональными линиями
        return (normalizedX, normalizedY) => {
            // Проверка, находится ли точка внутри контура сердца
            if (!this.isPointInContour(normalizedX, normalizedY)) {
                return false;
            }

            // Создаём узор - диагональные линии с градиентом
            const gridSize = 8; // Частота узора
            const diagonal = (normalizedX * gridSize + normalizedY * gridSize) % 2;
            const gradient = normalizedY; // Градиент сверху вниз

            // Комбинированный паттерн
            return diagonal < 1 && gradient > 0.2;
        };
    }

    async handleFileUpload(file, extension) {
        try {
            let result;

            if (extension === 'svg') {
                result = await this.svgLoader.loadSVG(file);
            } else if (extension === 'dxf') {
                result = await this.dxfLoader.loadDXF(file);
            } else {
                throw new Error('Неподдерживаемый формат файла');
            }

            // Сохраняем тип файла
            this.fileType = extension;
            
            // Сохраняем контур и функцию отрисовки
            if (result.contour && result.contour.length > 0) {
                this.originalContour = result.contour;
                this.contour = result.contour;
            }
            this.originalDrawingFunction = result.drawingFunction;
            this.originalDrawing = result.drawingFunction;

            this.loadedFileName = file.name;
            this.hasLoadedFile = true;

            if (extension === 'svg') {
                // Для SVG сохраняем исходные размеры и применяем масштаб
                this.originalFileWidthMM = result.width;
                this.originalFileHeightMM = result.height;
                this.scale = 1.0;
                this.applyScale();
                this.uiController.showScaleSection(true);
                this.uiController.updateScale(1.0);
            } else if (extension === 'dxf') {
                // Для DXF используем размеры напрямую, без масштабирования
                this.fileWidthMM = result.width;
                this.fileHeightMM = result.height;
                this.originalFileWidthMM = null;
                this.originalFileHeightMM = null;
                this.uiController.showScaleSection(false);
            }

            // Обновляем UI
            this.uiController.updateFileInfo(this.loadedFileName, this.fileWidthMM, this.fileHeightMM);
            this.updateUI();
            this.render();

        } catch (error) {
            console.error(`Ошибка загрузки ${extension.toUpperCase()}:`, error);
            const errorMessage = error.message || `Неизвестная ошибка при загрузке ${extension.toUpperCase()}`;
            alert(`Ошибка загрузки ${extension.toUpperCase()} файла: ${errorMessage}`);
        }
    }

    handlePixelWidthChange(value) {
        this.pixelWidthMM = value;
        this.uiController.updatePixelInputs(this.pixelWidthMM, this.pixelHeightMM);
        this.updateUI();
        this.render();
    }

    handlePixelHeightChange(value) {
        this.pixelHeightMM = value;
        this.uiController.updatePixelInputs(this.pixelWidthMM, this.pixelHeightMM);
        this.updateUI();
        this.render();
    }

    handleWorkspaceWidthChange(value) {
        this.workspaceWidthMM = value;
        this.uiController.updateWorkspaceInputs(this.workspaceWidthMM, this.workspaceHeightMM);
        this.setupCanvas();
        this.updateUI();
        this.render();
    }

    handleWorkspaceHeightChange(value) {
        this.workspaceHeightMM = value;
        this.uiController.updateWorkspaceInputs(this.workspaceWidthMM, this.workspaceHeightMM);
        this.setupCanvas();
        this.updateUI();
        this.render();
    }

    handleScaleChange(value) {
        // Масштабирование применяется только для SVG файлов
        if (this.fileType !== 'svg') {
            return;
        }
        
        this.scale = value;
        this.applyScale();
        
        // Обновляем информацию о файле с новыми размерами
        if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM && this.loadedFileName) {
            this.uiController.updateFileInfo(this.loadedFileName, this.fileWidthMM, this.fileHeightMM);
        }
        
        this.updateUI();
        this.render();
    }

    handleGridTypeChange(type) {
        this.gridType = type;
        this.render();
    }
    
    handleGridOffsetXChange(value) {
        this.gridOffsetX = value;
        this.uiController.updateGridOffsetInputs(this.gridOffsetX, this.gridOffsetY);
        this.render();
    }
    
    handleGridOffsetYChange(value) {
        this.gridOffsetY = value;
        this.uiController.updateGridOffsetInputs(this.gridOffsetX, this.gridOffsetY);
        this.render();
    }

    isPointInContour(x, y) {
        // Проверка методом ray casting
        let inside = false;
        const points = this.contour;

        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x;
            const yi = points[i].y;
            const xj = points[j].x;
            const yj = points[j].y;

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }

    updateUI() {
        // Вычисляем количество пикселей по каждой оси
        const gridWidth = Math.max(1, Math.floor(this.workspaceWidthMM / this.pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(this.workspaceHeightMM / this.pixelHeightMM));
        
        // Подсчитываем количество заполненных бисеринок
        const filledBeads = this.countFilledBeads(gridWidth, gridHeight);

        this.uiController.updateUI({
            pixelWidthMM: this.pixelWidthMM,
            pixelHeightMM: this.pixelHeightMM,
            workspaceWidthMM: this.workspaceWidthMM,
            workspaceHeightMM: this.workspaceHeightMM,
            gridWidth,
            gridHeight,
            filledBeads
        });
    }
    
    /**
     * Подсчитывает количество заполненных бисеринок в узоре
     * @param {number} gridWidth - ширина сетки
     * @param {number} gridHeight - высота сетки
     * @returns {number} количество заполненных бисеринок
     */
    countFilledBeads(gridWidth, gridHeight) {
        if (!this.originalDrawing) return 0;
        
        const canvasWidth = this.currentCanvasWidth || this.canvas.width;
        const canvasHeight = this.currentCanvasHeight || this.canvas.height;
        
        const pixelWidthPx = canvasWidth / gridWidth;
        const pixelHeightPx = canvasHeight / gridHeight;
        
        // Преобразуем смещение из мм в пиксели экрана
        const gridOffsetPxX = (this.gridOffsetX / this.workspaceWidthMM) * canvasWidth;
        const gridOffsetPxY = (this.gridOffsetY / this.workspaceHeightMM) * canvasHeight;
        
        // Вычисляем масштаб для файла
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
            scaleX = this.fileWidthMM / this.workspaceWidthMM;
            scaleY = this.fileHeightMM / this.workspaceHeightMM;
            offsetX = (1.0 - scaleX) / 2.0;
            offsetY = (1.0 - scaleY) / 2.0;
        }
        
        let count = 0;
        
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                // Смещение для разных типов сеток
                let offsetPxX = 0;
                let offsetPxY = 0;
                
                if (this.gridType === 'peyote') {
                    offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
                } else if (this.gridType === 'brick') {
                    offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
                }
                
                // Экранные координаты с учётом смещения сетки
                const x = col * pixelWidthPx + offsetPxX + gridOffsetPxX;
                const y = row * pixelHeightPx + offsetPxY + gridOffsetPxY;
                
                // Нормализованные координаты центра
                const workspaceX = (x + pixelWidthPx / 2) / canvasWidth;
                const workspaceY = (y + pixelHeightPx / 2) / canvasHeight;
                
                // Преобразуем в координаты файла
                let fileX = workspaceX;
                let fileY = workspaceY;
                
                if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;
                    
                    // Пропускаем бисеринки вне файла
                    if (fileX < 0 || fileX > 1 || fileY < 0 || fileY > 1) {
                        continue;
                    }
                }
                
                if (this.originalDrawing(fileX, fileY)) {
                    count++;
                }
            }
        }
        
        return count;
    }

    render() {
        const canvasWidth = this.currentCanvasWidth || this.canvas.width;
        const canvasHeight = this.currentCanvasHeight || this.canvas.height;

        this.renderer.render({
            canvasWidth,
            canvasHeight,
            workspaceWidthMM: this.workspaceWidthMM,
            workspaceHeightMM: this.workspaceHeightMM,
            pixelWidthMM: this.pixelWidthMM,
            pixelHeightMM: this.pixelHeightMM,
            originalDrawing: this.originalDrawing,
            contour: this.contour,
            hasLoadedFile: this.hasLoadedFile,
            fileWidthMM: this.fileWidthMM,
            fileHeightMM: this.fileHeightMM,
            gridType: this.gridType,
            gridOffsetX: this.gridOffsetX,
            gridOffsetY: this.gridOffsetY,
            hoveredRow: this.hoveredRow
        });
        
        // Обновляем статистику после рендеринга
        this.updateUI();
    }
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    new PixelGridDemo();
});
