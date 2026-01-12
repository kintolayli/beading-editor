/**
 * Главный класс приложения Beading Studio
 * Управляет всеми компонентами: загрузкой файлов, рендерингом, UI и состоянием проекта
 */
class BeadingStudio {
    /**
     * Инициализирует приложение Beading Studio
     */
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Константы
        this.workspaceWidthMM = DEFAULT_WORKSPACE_WIDTH_MM;
        this.workspaceHeightMM = DEFAULT_WORKSPACE_HEIGHT_MM;

        // Начальные размеры пикселя в мм
        this.pixelWidthMM = DEFAULT_PIXEL_WIDTH_MM;
        this.pixelHeightMM = DEFAULT_PIXEL_HEIGHT_MM;

        // Тип сетки ('peyote', 'brick')
        this.gridType = 'peyote';

        // Смещение сетки в мм
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

        // Масштаб для SVG файлов
        this.scale = 1.0;

        // Порог заполнения бисеринки (0.0 - 1.0)
        // При инвертированной UI логике: 0.25 внутри = 75% в UI
        this.fillThreshold = DEFAULT_FILL_THRESHOLD;

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
        this.hoveredBead = null; // Конкретная бисеринка { row, col, isFilled }
        this.mouseX = null;
        this.mouseY = null;

        // Флаг для автозагрузки (чтобы не показывать alert)
        this.isAutoLoading = false;

        // Данные загруженного файла для сохранения проекта
        this.loadedFileData = null; // base64 строка файла
        this.loadedFileExtension = null; // 'svg' или 'dxf'

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
            onFillThresholdChange: (value) => this.handleFillThresholdChange(value),
            onSaveProject: () => this.saveProject(),
            onLoadProject: (file) => this.loadProject(file),
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

        // Обработчики горячих клавиш
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Первая отрисовка
        this.render();

        // Автозагрузка файла по умолчанию (с небольшой задержкой для полной инициализации)
        setTimeout(() => {
            this.loadDefaultFile();
        }, 100);
    }

    /**
     * Загружает файл по умолчанию при старте приложения
     */
    async loadDefaultFile() {
        try {
            this.isAutoLoading = true; // Флаг для подавления alert при автозагрузке

            const response = await fetch('./Sketch_base.dxf');

            if (!response.ok) {
                this.isAutoLoading = false;
                return;
            }

            const blob = await response.blob();

            if (blob.size === 0) {
                this.isAutoLoading = false;
                return;
            }

            const file = new File([blob], 'Sketch_base.dxf', { type: 'application/dxf' });
            await this.handleFileUpload(file, 'dxf');
            this.isAutoLoading = false;
        } catch (error) {
            console.error('Ошибка при загрузке файла по умолчанию:', error);
            this.isAutoLoading = false;
        }
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
        let beadRow = null;
        let beadCol = null;

        if (this.gridType === 'peyote') {
            // Для peyote определяем столбец (вертикальный ряд)
            const adjustedX = x - gridOffsetPxX;
            const col = Math.floor(adjustedX / pixelWidthPx);

            // Учитываем смещение peyote для определения строки
            const offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
            const adjustedY = y - gridOffsetPxY - offsetPxY;
            const row = Math.floor(adjustedY / pixelHeightPx);

            if (col >= 0 && col < gridWidth) {
                rowIndex = col;
                beadCol = col;
                if (row >= 0 && row < gridHeight) {
                    beadRow = row;
                }
            }
        } else if (this.gridType === 'brick') {
            // Для brick определяем строку (горизонтальный ряд)
            const adjustedY = y - gridOffsetPxY;
            const row = Math.floor(adjustedY / pixelHeightPx);

            // Учитываем смещение brick для определения столбца
            const offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
            const adjustedX = x - gridOffsetPxX - offsetPxX;
            const col = Math.floor(adjustedX / pixelWidthPx);

            if (row >= 0 && row < gridHeight) {
                rowIndex = row;
                beadRow = row;
                if (col >= 0 && col < gridWidth) {
                    beadCol = col;
                }
            }
        }

        // Определяем, заполнена ли бисеринка
        // Показываем выделение только для заполненных бисеринок
        let newHoveredBead = null;
        if (beadRow !== null && beadCol !== null) {
            const isFilled = this.isBeadFilled(beadRow, beadCol);
            // Устанавливаем hoveredBead только если бисеринка заполнена
            if (isFilled) {
                newHoveredBead = { row: beadRow, col: beadCol, isFilled: true };
            }
        }

        // Проверяем, изменилась ли выбранная бисеринка
        const beadChanged = !this.hoveredBead || !newHoveredBead ||
            (this.hoveredBead && newHoveredBead &&
                (this.hoveredBead.row !== newHoveredBead.row ||
                    this.hoveredBead.col !== newHoveredBead.col));

        if (this.hoveredRow !== rowIndex || beadChanged) {
            this.hoveredRow = rowIndex;
            this.hoveredBead = newHoveredBead;
            this.render();
        }
        this.updateRowOverlayInfo();
    }

    /**
     * Проверяет, заполнена ли бисеринка по её координатам в сетке
     */
    isBeadFilled(row, col) {
        if (!this.originalDrawing) return false;

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

        // Вычисляем позицию бисеринки с учётом смещения сетки
        let x, y;
        if (this.gridType === 'peyote') {
            const offsetPxY = (col % 2 === 1) ? pixelHeightPx / 2 : 0;
            x = col * pixelWidthPx + gridOffsetPxX;
            y = row * pixelHeightPx + offsetPxY + gridOffsetPxY;
        } else {
            const offsetPxX = (row % 2 === 1) ? pixelWidthPx / 2 : 0;
            x = col * pixelWidthPx + offsetPxX + gridOffsetPxX;
            y = row * pixelHeightPx + gridOffsetPxY;
        }

        const fillPercentage = this.calculateBeadFillPercentage(
            x, y, pixelWidthPx, pixelHeightPx, canvasWidth, canvasHeight, scaleX, scaleY, offsetX, offsetY
        );

        return this.fillThreshold === 0 ? fillPercentage > 0 : fillPercentage >= this.fillThreshold;
    }

    handleMouseLeave() {
        this.hoveredRow = null;
        this.hoveredBead = null;
        this.mouseX = null;
        this.mouseY = null;
        this.render();
        this.hideRowOverlayInfo();
    }

    /**
     * Обрабатывает нажатия горячих клавиш
     * @param {KeyboardEvent} e - событие клавиатуры
     */
    handleKeyDown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

        // Ctrl+S / Cmd+S - сохранить проект
        if (ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveProject();
            return;
        }

        // Ctrl+O / Cmd+O - загрузить проект
        if (ctrlKey && e.key === 'o') {
            e.preventDefault();
            const loadBtn = document.getElementById('loadProjectBtn');
            if (loadBtn) {
                loadBtn.click();
            }
            return;
        }
    }

    /**
     * Вычисляет процент заполнения бисеринки фигурой
     * @param {number} x - координата X бисеринки в пикселях
     * @param {number} y - координата Y бисеринки в пикселях
     * @param {number} pixelWidthPx - ширина бисеринки в пикселях
     * @param {number} pixelHeightPx - высота бисеринки в пикселях
     * @param {number} canvasWidth - ширина canvas
     * @param {number} canvasHeight - высота canvas
     * @param {number} scaleX - масштаб по X
     * @param {number} scaleY - масштаб по Y
     * @param {number} offsetX - смещение по X
     * @param {number} offsetY - смещение по Y
     * @returns {number} процент заполнения от 0 до 1
     */
    calculateBeadFillPercentage(x, y, pixelWidthPx, pixelHeightPx, canvasWidth, canvasHeight, scaleX, scaleY, offsetX, offsetY) {
        const sampleGridSize = SAMPLE_GRID_SIZE;
        let filledPoints = 0;
        let totalPoints = 0;

        for (let sy = 0; sy < sampleGridSize; sy++) {
            for (let sx = 0; sx < sampleGridSize; sx++) {
                // Координаты точки внутри бисеринки (от 0.05 до 0.95, чтобы не попадать на границы)
                const offsetX_local = 0.05 + (sx / (sampleGridSize - 1)) * 0.9;
                const offsetY_local = 0.05 + (sy / (sampleGridSize - 1)) * 0.9;

                // Нормализованные координаты точки относительно рабочей области
                const workspaceX = (x + pixelWidthPx * offsetX_local) / canvasWidth;
                const workspaceY = (y + pixelHeightPx * offsetY_local) / canvasHeight;

                // Преобразуем координаты рабочей области в координаты файла
                let fileX = workspaceX;
                let fileY = workspaceY;

                if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
                    // Преобразуем координаты рабочей области в координаты файла
                    fileX = (workspaceX - offsetX) / scaleX;
                    fileY = (workspaceY - offsetY) / scaleY;

                    // НЕ пропускаем точки вне файла - originalDrawing сам обработает масштабирование
                    // При масштабировании > 1 координаты могут выходить за [0, 1], но originalDrawing
                    // правильно преобразует их обратно к исходному масштабу
                }

                totalPoints++;

                // Проверяем, заполнена ли точка (используем координаты файла)
                // originalDrawing сам обработает масштабирование и вернет false для точек вне исходной формы
                const isFilled = this.originalDrawing(fileX, fileY);

                if (isFilled) {
                    filledPoints++;
                }
            }
        }

        return totalPoints > 0 ? filledPoints / totalPoints : 0;
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

                const fillPercentage = this.calculateBeadFillPercentage(
                    x, y, pixelWidthPx, pixelHeightPx, canvasWidth, canvasHeight, scaleX, scaleY, offsetX, offsetY
                );

                // Для порога 0 требуется fillPercentage > 0
                const isFilled = this.fillThreshold === 0
                    ? fillPercentage > 0
                    : fillPercentage >= this.fillThreshold;
                if (isFilled) {
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

                const fillPercentage = this.calculateBeadFillPercentage(
                    x, y, pixelWidthPx, pixelHeightPx, canvasWidth, canvasHeight, scaleX, scaleY, offsetX, offsetY
                );

                // Для порога 0 требуется fillPercentage > 0
                const isFilled = this.fillThreshold === 0
                    ? fillPercentage > 0
                    : fillPercentage >= this.fillThreshold;
                if (isFilled) {
                    count++;
                }
            }
        }

        return count;
    }

    updateRowOverlayInfo() {
        if (this.hoveredRow === null && this.hoveredBead === null) {
            this.hideRowOverlayInfo();
            return;
        }

        const count = this.hoveredRow !== null ? this.countBeadsInRow(this.hoveredRow) : 0;
        const rowType = this.gridType === 'peyote' ? 'столбец' : 'строка';
        const rowNumber = this.hoveredRow !== null ? this.hoveredRow + 1 : 0;

        const overlay = document.getElementById('rowOverlayInfo');
        if (overlay) {
            // Очищаем предыдущее содержимое
            overlay.innerHTML = '';

            // Создаем элементы через DOM API для безопасности
            const content = document.createElement('div');
            content.className = 'row-overlay-content';

            const title = document.createElement('div');
            title.className = 'row-overlay-title';
            title.textContent = `${rowType.toUpperCase()} ${rowNumber}`;

            const countEl = document.createElement('div');
            countEl.className = 'row-overlay-count';
            countEl.textContent = `${count} бисеринок`;

            content.appendChild(title);
            content.appendChild(countEl);

            // Информация о бисеринке (показываем только для заполненных)
            if (this.hoveredBead) {
                const beadRow = this.hoveredBead.row + 1;
                const beadCol = this.hoveredBead.col + 1;
                const beadInfo = document.createElement('div');
                beadInfo.className = 'row-overlay-bead';
                beadInfo.textContent = `● Бисеринка [${beadCol}, ${beadRow}]`;
                content.appendChild(beadInfo);
            }

            overlay.appendChild(content);
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
        // Инициализируем пустое состояние (без рисунка)
        this.originalContour = null;
        this.contour = null;

        // Сбрасываем размеры файла
        this.fileWidthMM = null;
        this.fileHeightMM = null;
        this.originalFileWidthMM = null;
        this.originalFileHeightMM = null;
        this.loadedFileName = null;
        this.fileType = null;
        this.hasLoadedFile = false;
        this.scale = 1.0;

        // Пустая функция рисунка (ничего не заполнено)
        this.originalDrawingFunction = () => false;
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
        const currentScale = this.scale || 1.0; // Захватываем текущий масштаб

        // Для масштаба 1.0 используем исходную функцию напрямую (без преобразования)
        if (Math.abs(currentScale - 1.0) < SCALE_EPSILON) {
            this.originalDrawing = originalFunc;
        } else {
            // Для других масштабов преобразуем координаты
            this.originalDrawing = (normalizedX, normalizedY) => {
                // Преобразуем координаты обратно к исходному масштабу
                const dx = normalizedX - centerX;
                const dy = normalizedY - centerY;
                const origX = centerX + dx / currentScale;
                const origY = centerY + dy / currentScale;

                // Проверяем границы исходного файла [0, 1]
                // Если координаты вне границ, возвращаем false (точка вне исходной формы)
                if (origX < 0 || origX > 1 || origY < 0 || origY > 1) {
                    return false;
                }

                return originalFunc(origX, origY);
            };
        }
    }

    async handleFileUpload(file, extension) {
        try {
            // Валидация размера файла
            const fileSizeValidation = Validator.validateFileSize(file.size);
            if (!fileSizeValidation.valid) {
                this.showNotification(fileSizeValidation.error, 'error');
                return;
            }

            // Показываем индикатор загрузки
            this.showLoading('Загрузка файла...');

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

            // Сохраняем файл как base64 для сохранения проекта
            this.loadedFileExtension = extension;
            const reader = new FileReader();
            reader.onload = (e) => {
                // Убираем префикс data:...;base64,
                const base64String = e.target.result.split(',')[1];
                this.loadedFileData = base64String;
            };
            reader.readAsDataURL(file);

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

            // Скрываем индикатор загрузки
            this.hideLoading();
            if (!this.isAutoLoading) {
                this.showNotification('Файл успешно загружен', 'success');
            }

        } catch (error) {
            console.error(`Ошибка загрузки ${extension.toUpperCase()}:`, error);
            const errorMessage = error.message || `Неизвестная ошибка при загрузке ${extension.toUpperCase()}`;
            this.hideLoading();
            // Не показываем alert при автозагрузке
            if (!this.isAutoLoading) {
                this.showNotification(`Ошибка загрузки: ${errorMessage}`, 'error');
            }
        }
    }

    /**
     * Показывает индикатор загрузки
     * @param {string} text - текст для отображения
     */
    showLoading(text = 'Загрузка...') {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            const textEl = indicator.querySelector('.loading-text');
            if (textEl) {
                textEl.textContent = text;
            }
            indicator.style.display = 'flex';
        }
    }

    /**
     * Скрывает индикатор загрузки
     */
    hideLoading() {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    /**
     * Показывает уведомление пользователю
     * @param {string} message - сообщение
     * @param {string} type - тип уведомления ('success', 'error', 'info')
     */
    showNotification(message, type = 'info') {
        // Создаем временное уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? 'rgba(0, 255, 157, 0.9)' : type === 'error' ? 'rgba(255, 107, 107, 0.9)' : 'rgba(0, 212, 255, 0.9)'};
            color: var(--bg-primary);
            padding: 1rem 1.5rem;
            border-radius: 6px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
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
        this.workspaceWidthMM = Validator.validateWorkspaceSize(value);
        this.uiController.updateWorkspaceInputs(this.workspaceWidthMM, this.workspaceHeightMM);
        this.setupCanvas();
        this.updateUI();
        this.render();
    }

    handleWorkspaceHeightChange(value) {
        this.workspaceHeightMM = Validator.validateWorkspaceSize(value);
        this.uiController.updateWorkspaceInputs(this.workspaceWidthMM, this.workspaceHeightMM);
        this.setupCanvas();
        this.updateUI();
        this.render();
    }

    handleFillThresholdChange(value) {
        // Инвертируем логику: 100% чувствительности = 0% порога (показать все)
        // 0% чувствительности = 100% порога (только полные)
        const invertedValue = 1 - value;
        this.fillThreshold = Validator.validateFillThreshold(invertedValue);
        this.updateUI();
        this.render();
    }

    handleScaleChange(value) {
        // Масштабирование применяется только для SVG файлов
        if (this.fileType !== 'svg') {
            return;
        }

        // Валидация масштаба
        this.scale = Validator.validateScale(value);
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
        this.gridOffsetX = Validator.validateGridOffset(value);
        this.uiController.updateGridOffsetInputs(this.gridOffsetX, this.gridOffsetY);
        this.render();
    }

    handleGridOffsetYChange(value) {
        this.gridOffsetY = Validator.validateGridOffset(value);
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

                // Вычисляем процент заполнения бисеринки
                const fillPercentage = this.calculateBeadFillPercentage(
                    x, y, pixelWidthPx, pixelHeightPx, canvasWidth, canvasHeight, scaleX, scaleY, offsetX, offsetY
                );

                // Бисеринка считается заполненной, если процент заполнения >= порога
                // Для порога 0 требуется fillPercentage > 0 (хотя бы частичное заполнение)
                const isFilled = this.fillThreshold === 0
                    ? fillPercentage > 0
                    : fillPercentage >= this.fillThreshold;
                if (isFilled) {
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
            hoveredRow: this.hoveredRow,
            hoveredBead: this.hoveredBead,
            fillThreshold: this.fillThreshold
        });

        // Обновляем статистику после рендеринга
        this.updateUI();
    }

    /**
     * Сохраняет проект в JSON файл
     */
    async saveProject() {
        try {
            this.showLoading('Сохранение проекта...');

            // Предлагаем имя файла по умолчанию
            const defaultName = this.loadedFileName ?
                this.loadedFileName.replace(/\.[^/.]+$/, '') :
                'project';

            let cleanFileName;
            let isElectron = false;

            // Проверяем, запущено ли приложение в Electron
            const isElectronEnv = typeof window !== 'undefined' &&
                typeof window.process !== 'undefined' &&
                window.process.type === 'renderer';

            if (isElectronEnv) {
                try {
                    // Используем IPC для вызова диалога из главного процесса
                    const { ipcRenderer } = require('electron');

                    const result = await ipcRenderer.invoke('show-save-dialog', {
                        title: 'Сохранить проект',
                        defaultPath: defaultName + '.beading',
                        filters: [
                            { name: 'Проекты бисероплетения', extensions: ['beading'] },
                            { name: 'Все файлы', extensions: ['*'] }
                        ]
                    });

                    // Если пользователь отменил диалог
                    if (result.canceled || !result.filePath) {
                        return;
                    }

                    cleanFileName = result.filePath;
                    isElectron = true;
                } catch (error) {
                    console.error('Ошибка при открытии диалога сохранения:', error);
                    // Fallback на браузерный диалог
                    cleanFileName = await this.showSaveDialogBrowser(defaultName);
                    if (!cleanFileName) {
                        return; // Пользователь отменил
                    }
                }
            } else {
                // Fallback для браузера - используем input элемент
                cleanFileName = await this.showSaveDialogBrowser(defaultName);
                if (!cleanFileName) {
                    return; // Пользователь отменил
                }
            }

            const projectData = {
                version: '1.0.0',
                workspaceWidthMM: this.workspaceWidthMM,
                workspaceHeightMM: this.workspaceHeightMM,
                pixelWidthMM: this.pixelWidthMM,
                pixelHeightMM: this.pixelHeightMM,
                gridType: this.gridType,
                gridOffsetX: this.gridOffsetX,
                gridOffsetY: this.gridOffsetY,
                scale: this.scale,
                fillThreshold: this.fillThreshold,
                fileType: this.fileType,
                hasLoadedFile: this.hasLoadedFile,
                fileWidthMM: this.fileWidthMM,
                fileHeightMM: this.fileHeightMM,
                originalFileWidthMM: this.originalFileWidthMM,
                originalFileHeightMM: this.originalFileHeightMM,
                loadedFileName: this.loadedFileName,
                loadedFileData: this.loadedFileData, // base64
                loadedFileExtension: this.loadedFileExtension,
                originalContour: this.originalContour,
                contour: this.contour
            };

            const jsonString = JSON.stringify(projectData, null, 2);

            // Сохраняем файл в зависимости от окружения
            if (isElectron) {
                try {
                    // Используем IPC для сохранения файла из главного процесса
                    const { ipcRenderer } = require('electron');
                    const result = await ipcRenderer.invoke('save-file', cleanFileName, jsonString);

                    if (!result.success) {
                        throw new Error(result.error || 'Неизвестная ошибка при сохранении');
                    }
                    // Проект успешно сохранен
                    this.hideLoading();
                    this.showNotification('Проект успешно сохранен', 'success');
                } catch (error) {
                    console.error('Ошибка при сохранении проекта в Electron:', error);
                    this.hideLoading();
                    this.showNotification('Ошибка при сохранении: ' + error.message, 'error');
                }
            } else {
                // Fallback для браузера - скачивание файла
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = cleanFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                // Проект успешно сохранен
                this.hideLoading();
                this.showNotification('Проект успешно сохранен', 'success');
            }
        } catch (error) {
            console.error('Ошибка при сохранении проекта:', error);
            this.hideLoading();
            this.showNotification('Ошибка при сохранении: ' + error.message, 'error');
        }
    }

    /**
     * Показывает диалог сохранения для браузера (fallback)
     */
    async showSaveDialogBrowser(defaultName) {
        return new Promise((resolve) => {
            // Создаем модальное окно
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white;
                padding: 20px;
                border-radius: 8px;
                min-width: 300px;
            `;

            // Создаем элементы через DOM API для безопасности
            const h3 = document.createElement('h3');
            h3.style.marginTop = '0';
            h3.textContent = 'Сохранить проект';

            const label = document.createElement('label');
            label.textContent = 'Имя файла:';

            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'fileNameInput';
            input.value = `${defaultName}.beading`;
            input.style.cssText = 'width: 100%; margin-top: 8px; padding: 8px; box-sizing: border-box;';

            label.appendChild(document.createTextNode(' '));
            label.appendChild(input);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;';

            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelBtn';
            cancelBtn.style.padding = '8px 16px';
            cancelBtn.textContent = 'Отмена';

            const saveBtn = document.createElement('button');
            saveBtn.id = 'saveBtn';
            saveBtn.style.padding = '8px 16px';
            saveBtn.textContent = 'Сохранить';

            buttonContainer.appendChild(cancelBtn);
            buttonContainer.appendChild(saveBtn);

            dialog.appendChild(h3);
            dialog.appendChild(label);
            dialog.appendChild(buttonContainer);

            modal.appendChild(dialog);
            document.body.appendChild(modal);

            // input уже создан выше, просто выбираем его
            input.select();

            const cleanup = () => {
                document.body.removeChild(modal);
            };

            dialog.querySelector('#cancelBtn').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            dialog.querySelector('#saveBtn').addEventListener('click', () => {
                let fileName = input.value.trim();
                if (!fileName) {
                    fileName = defaultName;
                }
                // Используем Validator для очистки имени файла
                fileName = Validator.sanitizeFileName(fileName);
                if (!fileName.endsWith('.beading')) {
                    fileName += '.beading';
                }
                cleanup();
                resolve(fileName);
            });

            // Закрытие по Escape
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    document.removeEventListener('keydown', handleEscape);
                    resolve(null);
                }
            };
            document.addEventListener('keydown', handleEscape);

            // Закрытие по клику вне диалога
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cleanup();
                    document.removeEventListener('keydown', handleEscape);
                    resolve(null);
                }
            });

            input.focus();
        });
    }

    /**
     * Загружает проект из JSON файла
     */
    async loadProject(file) {
        try {
            // Валидация размера файла проекта
            const fileSizeValidation = Validator.validateFileSize(file.size, 10 * 1024 * 1024); // 10MB для проектов
            if (!fileSizeValidation.valid) {
                this.showNotification(fileSizeValidation.error, 'error');
                return;
            }

            this.showLoading('Загрузка проекта...');
            const text = await file.text();
            const projectData = JSON.parse(text);

            // Восстанавливаем настройки
            this.workspaceWidthMM = projectData.workspaceWidthMM || 150;
            this.workspaceHeightMM = projectData.workspaceHeightMM || 150;
            this.pixelWidthMM = projectData.pixelWidthMM || 3.1;
            this.pixelHeightMM = projectData.pixelHeightMM || 3.1;
            this.gridType = projectData.gridType || 'peyote';
            this.gridOffsetX = projectData.gridOffsetX || 0;
            this.gridOffsetY = projectData.gridOffsetY || 0;
            this.scale = projectData.scale || 1.0;
            this.fillThreshold = projectData.fillThreshold !== undefined ? projectData.fillThreshold : DEFAULT_FILL_THRESHOLD;

            // Восстанавливаем данные файла
            this.fileType = projectData.fileType;
            this.hasLoadedFile = projectData.hasLoadedFile || false;
            this.fileWidthMM = projectData.fileWidthMM;
            this.fileHeightMM = projectData.fileHeightMM;
            this.originalFileWidthMM = projectData.originalFileWidthMM;
            this.originalFileHeightMM = projectData.originalFileHeightMM;
            this.loadedFileName = projectData.loadedFileName;
            this.originalContour = projectData.originalContour;
            this.contour = projectData.contour;

            // Восстанавливаем файл, если он был сохранен
            if (projectData.hasLoadedFile && projectData.loadedFileData && projectData.loadedFileExtension) {
                // Конвертируем base64 обратно в Blob
                const base64Data = projectData.loadedFileData;
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray]);

                // Создаем File объект
                const fileObj = new File([blob], projectData.loadedFileName || 'file.' + projectData.loadedFileExtension, {
                    type: projectData.loadedFileExtension === 'svg' ? 'image/svg+xml' : 'application/dxf'
                });

                // Загружаем файл
                await this.handleFileUpload(fileObj, projectData.loadedFileExtension);

                // Восстанавливаем масштаб для SVG (после загрузки файла)
                if (projectData.loadedFileExtension === 'svg' && projectData.scale !== undefined) {
                    this.scale = projectData.scale;
                    this.applyScale();
                    this.uiController.updateScale(this.scale);
                }
            } else {
                // Если файла не было, восстанавливаем пустое состояние
                this.createOriginalDrawing();
            }

            // Обновляем UI
            this.uiController.updatePixelInputs(this.pixelWidthMM, this.pixelHeightMM);
            this.uiController.updateWorkspaceInputs(this.workspaceWidthMM, this.workspaceHeightMM);
            this.uiController.setActiveGridType(this.gridType);
            this.uiController.updateGridOffsetInputs(this.gridOffsetX, this.gridOffsetY);
            this.uiController.updateFillThreshold(this.fillThreshold);
            if (this.fileType === 'svg') {
                this.uiController.showScaleSection(true);
                this.uiController.updateScale(this.scale);
            } else {
                this.uiController.showScaleSection(false);
            }

            // Настраиваем canvas и перерисовываем
            this.setupCanvas();
            this.updateUI();
            this.render();

            // Проект успешно загружен
            this.hideLoading();
            this.showNotification('Проект успешно загружен', 'success');
        } catch (error) {
            console.error('Ошибка при загрузке проекта:', error);
            this.hideLoading();
            this.showNotification('Ошибка при загрузке: ' + error.message, 'error');
        }
    }
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    new BeadingStudio();
});
