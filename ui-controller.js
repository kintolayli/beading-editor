/**
 * Модуль для управления UI и обработки событий
 */
class UIController {
    /**
     * @param {Object} callbacks - колбэки для обновления состояния
     * @param {Function} callbacks.onPixelWidthChange - вызывается при изменении ширины пикселя
     * @param {Function} callbacks.onPixelHeightChange - вызывается при изменении высоты пикселя
     * @param {Function} callbacks.onWorkspaceWidthChange - вызывается при изменении ширины рабочей области
     * @param {Function} callbacks.onWorkspaceHeightChange - вызывается при изменении высоты рабочей области
     * @param {Function} callbacks.onFileUpload - вызывается при загрузке файла
     * @param {Function} callbacks.onGridTypeChange - вызывается при изменении типа сетки
     * @param {Function} callbacks.onUpdateUI - вызывается для обновления UI
     */
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.widthInput = document.getElementById('pixelWidthInput');
        this.heightInput = document.getElementById('pixelHeightInput');
        this.widthSlider = document.getElementById('pixelWidthSlider');
        this.heightSlider = document.getElementById('pixelHeightSlider');
        this.fileUpload = document.getElementById('fileUpload');
        this.workspaceWidthInput = document.getElementById('workspaceWidthInput');
        this.workspaceHeightInput = document.getElementById('workspaceHeightInput');
        this.gridTypeButtons = document.querySelectorAll('.grid-type-btn');
        this.gridOffsetXInput = document.getElementById('gridOffsetX');
        this.gridOffsetYInput = document.getElementById('gridOffsetY');
        this.gridOffsetXSlider = document.getElementById('gridOffsetXSlider');
        this.gridOffsetYSlider = document.getElementById('gridOffsetYSlider');
        
        this.initialize();
    }
    
    /**
     * Инициализирует обработчики событий
     */
    initialize() {
        const updateSliderProgress = (slider) => {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const value = parseFloat(slider.value);
            const progress = ((value - min) / (max - min)) * 100;
            slider.style.setProperty('--slider-progress', `${progress}%`);
        };
        
        // Обработчики для ширины пикселя
        this.widthInput.addEventListener('blur', () => {
            const value = this.clampPixelSize(parseFloat(this.widthInput.value));
            this.callbacks.onPixelWidthChange(value);
        });
        
        this.widthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.widthInput.blur();
            }
        });
        
        this.widthSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.callbacks.onPixelWidthChange(value);
        });
        
        // Обработчики для высоты пикселя
        this.heightInput.addEventListener('blur', () => {
            const value = this.clampPixelSize(parseFloat(this.heightInput.value));
            this.callbacks.onPixelHeightChange(value);
        });
        
        this.heightInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.heightInput.blur();
            }
        });
        
        this.heightSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.callbacks.onPixelHeightChange(value);
        });
        
        // Обработчики для размеров рабочей области
        this.workspaceWidthInput.addEventListener('blur', () => {
            const value = this.clampWorkspaceSize(parseFloat(this.workspaceWidthInput.value));
            this.callbacks.onWorkspaceWidthChange(value);
        });
        
        this.workspaceWidthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.workspaceWidthInput.blur();
            }
        });
        
        this.workspaceHeightInput.addEventListener('blur', () => {
            const value = this.clampWorkspaceSize(parseFloat(this.workspaceHeightInput.value));
            this.callbacks.onWorkspaceHeightChange(value);
        });
        
        this.workspaceHeightInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.workspaceHeightInput.blur();
            }
        });
        
        // Обработчик для загрузки файла
        this.fileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const extension = file.name.split('.').pop().toLowerCase();
            
            if (extension === 'svg' || extension === 'dxf') {
                this.callbacks.onFileUpload(file, extension);
            } else {
                alert('Пожалуйста, выберите SVG или DXF файл');
            }
        });
        
        // Обработчики для кнопок выбора типа сетки
        this.gridTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const gridType = btn.dataset.type;
                this.setActiveGridType(gridType);
                if (this.callbacks.onGridTypeChange) {
                    this.callbacks.onGridTypeChange(gridType);
                }
            });
        });
        
        // Обработчики для смещения сетки по X
        this.gridOffsetXInput.addEventListener('blur', () => {
            const value = this.clampOffset(parseFloat(this.gridOffsetXInput.value));
            if (this.callbacks.onGridOffsetXChange) {
                this.callbacks.onGridOffsetXChange(value);
            }
        });
        
        this.gridOffsetXInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.gridOffsetXInput.blur();
            }
        });
        
        this.gridOffsetXSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.gridOffsetXInput.value = value.toFixed(1);
            updateSliderProgress(this.gridOffsetXSlider);
            if (this.callbacks.onGridOffsetXChange) {
                this.callbacks.onGridOffsetXChange(value);
            }
        });
        
        // Обработчики для смещения сетки по Y
        this.gridOffsetYInput.addEventListener('blur', () => {
            const value = this.clampOffset(parseFloat(this.gridOffsetYInput.value));
            if (this.callbacks.onGridOffsetYChange) {
                this.callbacks.onGridOffsetYChange(value);
            }
        });
        
        this.gridOffsetYInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.gridOffsetYInput.blur();
            }
        });
        
        this.gridOffsetYSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.gridOffsetYInput.value = value.toFixed(1);
            updateSliderProgress(this.gridOffsetYSlider);
            if (this.callbacks.onGridOffsetYChange) {
                this.callbacks.onGridOffsetYChange(value);
            }
        });
        
        // Инициализация прогресса ползунков
        updateSliderProgress(this.widthSlider);
        updateSliderProgress(this.heightSlider);
        updateSliderProgress(this.gridOffsetXSlider);
        updateSliderProgress(this.gridOffsetYSlider);
    }
    
    /**
     * Устанавливает активный тип сетки
     * @param {string} gridType - тип сетки ('square', 'peyote', 'brick')
     */
    setActiveGridType(gridType) {
        this.gridTypeButtons.forEach(btn => {
            if (btn.dataset.type === gridType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    /**
     * Обновляет отображение UI
     * @param {Object} data - данные для отображения
     */
    updateUI(data) {
        const {
            pixelWidthMM,
            pixelHeightMM,
            workspaceWidthMM,
            workspaceHeightMM,
            gridWidth,
            gridHeight,
            filledBeads
        } = data;
        
        document.getElementById('pixelDimensionsDisplay').textContent = 
            `${pixelWidthMM.toFixed(3)} × ${pixelHeightMM.toFixed(3)}`;
        document.getElementById('gridSize').textContent = `${gridWidth}×${gridHeight}`;
        document.getElementById('totalPixels').textContent = filledBeads.toLocaleString('ru-RU');
        document.getElementById('workspaceSize').textContent = 
            `${workspaceWidthMM.toFixed(1)}×${workspaceHeightMM.toFixed(1)} мм`;
    }
    
    /**
     * Обновляет значения полей ввода пикселей
     * @param {number} width - ширина пикселя
     * @param {number} height - высота пикселя
     */
    updatePixelInputs(width, height) {
        this.widthInput.value = width.toFixed(3);
        this.heightInput.value = height.toFixed(3);
        
        if (width >= parseFloat(this.widthSlider.min) && width <= parseFloat(this.widthSlider.max)) {
            this.widthSlider.value = width;
            const min = parseFloat(this.widthSlider.min);
            const max = parseFloat(this.widthSlider.max);
            const progress = ((width - min) / (max - min)) * 100;
            this.widthSlider.style.setProperty('--slider-progress', `${progress}%`);
        }
        
        if (height >= parseFloat(this.heightSlider.min) && height <= parseFloat(this.heightSlider.max)) {
            this.heightSlider.value = height;
            const min = parseFloat(this.heightSlider.min);
            const max = parseFloat(this.heightSlider.max);
            const progress = ((height - min) / (max - min)) * 100;
            this.heightSlider.style.setProperty('--slider-progress', `${progress}%`);
        }
    }
    
    /**
     * Обновляет значения полей ввода рабочей области
     * @param {number} width - ширина рабочей области
     * @param {number} height - высота рабочей области
     */
    updateWorkspaceInputs(width, height) {
        this.workspaceWidthInput.value = width.toFixed(1);
        this.workspaceHeightInput.value = height.toFixed(1);
    }
    
    /**
     * Обновляет информацию о загруженном файле
     * @param {string} fileName - имя файла
     * @param {number} width - ширина файла в мм
     * @param {number} height - высота файла в мм
     */
    updateFileInfo(fileName, width, height) {
        document.getElementById('uploadInfo').textContent = 
            `Загружен: ${fileName} (${width.toFixed(1)}×${height.toFixed(1)} мм)`;
    }
    
    /**
     * Валидация размера пикселя
     * @param {number} value - значение
     * @returns {number} валидированное значение
     */
    clampPixelSize(value) {
        if (isNaN(value) || value <= 0) return 1.0;
        const min = 0.1;
        const max = 50;
        return Math.min(Math.max(value, min), max);
    }
    
    /**
     * Валидация размера рабочей области
     * @param {number} value - значение
     * @returns {number} валидированное значение
     */
    clampWorkspaceSize(value) {
        if (isNaN(value) || value <= 0) return 10;
        const min = 10;
        const max = 1000;
        return Math.min(Math.max(value, min), max);
    }
    
    /**
     * Валидация смещения сетки
     * @param {number} value - значение
     * @returns {number} валидированное значение
     */
    clampOffset(value) {
        if (isNaN(value)) return 0;
        const min = -50;
        const max = 50;
        return Math.min(Math.max(value, min), max);
    }
    
    /**
     * Обновляет значения смещения сетки
     * @param {number} offsetX - смещение по X
     * @param {number} offsetY - смещение по Y
     */
    updateGridOffsetInputs(offsetX, offsetY) {
        this.gridOffsetXInput.value = offsetX.toFixed(1);
        this.gridOffsetYInput.value = offsetY.toFixed(1);
        
        if (offsetX >= parseFloat(this.gridOffsetXSlider.min) && offsetX <= parseFloat(this.gridOffsetXSlider.max)) {
            this.gridOffsetXSlider.value = offsetX;
            const min = parseFloat(this.gridOffsetXSlider.min);
            const max = parseFloat(this.gridOffsetXSlider.max);
            const progress = ((offsetX - min) / (max - min)) * 100;
            this.gridOffsetXSlider.style.setProperty('--slider-progress', `${progress}%`);
        }
        
        if (offsetY >= parseFloat(this.gridOffsetYSlider.min) && offsetY <= parseFloat(this.gridOffsetYSlider.max)) {
            this.gridOffsetYSlider.value = offsetY;
            const min = parseFloat(this.gridOffsetYSlider.min);
            const max = parseFloat(this.gridOffsetYSlider.max);
            const progress = ((offsetY - min) / (max - min)) * 100;
            this.gridOffsetYSlider.style.setProperty('--slider-progress', `${progress}%`);
        }
    }
}
