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

        // Масштаб загруженного изображения
        this.scale = 1.0;
        this.hasLoadedFile = false;

        // Реальные размеры загруженного файла в мм
        this.fileWidthMM = null;
        this.fileHeightMM = null;

        // Исходные данные (до масштабирования)
        this.originalContour = null;
        this.originalDrawingFunction = null;
        this.contour = null;
        this.originalDrawing = null;

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

        // Первая отрисовка
        this.render();
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
        this.hasLoadedFile = false;

        // Создаём исходный рисунок в виде функции,
        // которая определяет, закрашен ли пиксель в данной нормализованной позиции
        // Нормализованные координаты: [0, 1] x [0, 1] относительно bounding box
        this.originalDrawingFunction = this.createHeartPattern();
        this.originalDrawing = this.originalDrawingFunction;
    }

    applyScale() {
        if (!this.originalContour || !this.originalDrawingFunction) {
            return;
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

            // Сохраняем контур и функцию отрисовки
            if (result.contour && result.contour.length > 0) {
                this.originalContour = result.contour;
            }
            this.originalDrawingFunction = result.drawingFunction;

            // Сохраняем реальные размеры файла
            this.fileWidthMM = result.width;
            this.fileHeightMM = result.height;

            // Сбрасываем масштаб и применяем
            this.scale = 1.0;
            this.hasLoadedFile = true;
            this.uiController.showScaleSection(true);
            this.uiController.updateScale(1.0);
            this.applyScale();

            // Обновляем UI
            this.uiController.updateFileInfo(file.name, this.fileWidthMM, this.fileHeightMM);
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
        this.scale = value;
        this.applyScale();
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
        const totalPixels = gridWidth * gridHeight;

        this.uiController.updateUI({
            pixelWidthMM: this.pixelWidthMM,
            pixelHeightMM: this.pixelHeightMM,
            workspaceWidthMM: this.workspaceWidthMM,
            workspaceHeightMM: this.workspaceHeightMM,
            gridWidth,
            gridHeight,
            totalPixels
        });
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
            fileHeightMM: this.fileHeightMM
        });
    }
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    new PixelGridDemo();
});
