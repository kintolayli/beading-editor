class PixelGridDemo {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Константы
        this.CANVAS_PIXEL_SIZE = 600; // Базовый размер canvas в экранных пикселях
        this.workspaceWidthMM = 150;  // Ширина рабочей области в мм
        this.workspaceHeightMM = 150; // Высота рабочей области в мм
        
        // Настройка canvas
        this.setupCanvas();
        
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
        
        // Создание исходного рисунка (инвариантное хранение)
        this.createOriginalDrawing();
        
        // Инициализация UI
        this.initializeUI();
        
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
            const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
            
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
    
    async loadSVG(file) {
        try {
            const text = await file.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(text, 'image/svg+xml');
            
            // Проверка на ошибки парсинга
            if (svgDoc.querySelector('parsererror')) {
                throw new Error('Ошибка парсинга SVG файла');
            }
            
            const svg = svgDoc.documentElement;
            
            // Получаем viewBox или размеры SVG
            const viewBox = svg.getAttribute('viewBox');
            let svgWidth, svgHeight, svgMinX = 0, svgMinY = 0;
            
            if (viewBox) {
                const [minX, minY, width, height] = viewBox.split(/\s+/).map(parseFloat);
                svgMinX = minX;
                svgMinY = minY;
                svgWidth = width;
                svgHeight = height;
            } else {
                // Парсим width и height, удаляя единицы измерения
                const widthStr = svg.getAttribute('width') || '100';
                const heightStr = svg.getAttribute('height') || '100';
                svgWidth = parseFloat(widthStr.replace(/[^\d.]/g, ''));
                svgHeight = parseFloat(heightStr.replace(/[^\d.]/g, ''));
            }
            
            // Извлекаем все path элементы
            const paths = svgDoc.querySelectorAll('path, polygon, polyline, circle, ellipse, rect');
            
            if (paths.length === 0) {
                throw new Error('SVG не содержит графических элементов');
            }
            
            // Создаём растровое представление для определения заполнения
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            const resolution = 200; // Разрешение для сэмплирования
            tempCanvas.width = resolution;
            tempCanvas.height = resolution;
            
            // Очищаем canvas белым цветом
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, resolution, resolution);
            
            // Рисуем SVG на временном canvas
            const img = new Image();
            const svgBlob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    try {
                        tempCtx.drawImage(img, 0, 0, resolution, resolution);
                        resolve();
                    } catch (err) {
                        reject(new Error('Ошибка отрисовки SVG: ' + err.message));
                    }
                };
                img.onerror = () => {
                    reject(new Error('Ошибка загрузки изображения SVG'));
                };
                img.src = url;
            });
            
            URL.revokeObjectURL(url);
            
            // Извлекаем контур из первого path
            const firstPath = paths[0];
            const contourPoints = this.extractContourFromPath(firstPath, svgWidth, svgHeight, svgMinX, svgMinY);
            
            if (contourPoints && contourPoints.length > 0) {
                this.originalContour = contourPoints;
            }
            
            // Создаём функцию проверки заполнения на основе растра
            const imageData = tempCtx.getImageData(0, 0, resolution, resolution);
            this.originalDrawingFunction = (normalizedX, normalizedY) => {
                const x = Math.floor(normalizedX * resolution);
                const y = Math.floor(normalizedY * resolution);
                
                if (x < 0 || x >= resolution || y < 0 || y >= resolution) {
                    return false;
                }
                
                const index = (y * resolution + x) * 4;
                const r = imageData.data[index];
                const g = imageData.data[index + 1];
                const b = imageData.data[index + 2];
                
                // Считаем заполненным, если не белый (учитываем чёрный цвет)
                return r < 200 && g < 200 && b < 200;
            };
            
            // Сохраняем реальные размеры файла
            this.fileWidthMM = svgWidth;
            this.fileHeightMM = svgHeight;
            
            // Сбрасываем масштаб и применяем
            this.scale = 1.0;
            this.hasLoadedFile = true;
            document.getElementById('scaleSlider').value = 1.0;
            document.getElementById('scaleSection').style.display = 'block';
            this.applyScale();
            
            // Обновляем отображение
            document.getElementById('uploadInfo').textContent = 
                `Загружен: ${file.name} (${this.fileWidthMM.toFixed(1)}×${this.fileHeightMM.toFixed(1)} мм)`;
            document.getElementById('scaleValue').textContent = '100%';
            this.render();
            
        } catch (error) {
            console.error('Ошибка загрузки SVG:', error);
            const errorMessage = error.message || 'Неизвестная ошибка при загрузке SVG';
            alert('Ошибка загрузки SVG файла: ' + errorMessage);
        }
    }
    
    async loadDXF(file) {
        try {
            const text = await file.text();
            const dxfData = this.parseDXF(text);
            
            if (!dxfData.entities || dxfData.entities.length === 0) {
                throw new Error('DXF не содержит графических объектов');
            }
            
            // Находим bounding box всех объектов для нормализации
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            dxfData.entities.forEach(entity => {
                if (entity.type === 'LINE') {
                    minX = Math.min(minX, entity.x1, entity.x2);
                    minY = Math.min(minY, entity.y1, entity.y2);
                    maxX = Math.max(maxX, entity.x1, entity.x2);
                    maxY = Math.max(maxY, entity.y1, entity.y2);
                } else if (entity.type === 'CIRCLE') {
                    minX = Math.min(minX, entity.cx - entity.radius);
                    minY = Math.min(minY, entity.cy - entity.radius);
                    maxX = Math.max(maxX, entity.cx + entity.radius);
                    maxY = Math.max(maxY, entity.cy + entity.radius);
                } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
                    entity.vertices.forEach(v => {
                        minX = Math.min(minX, v.x);
                        minY = Math.min(minY, v.y);
                        maxX = Math.max(maxX, v.x);
                        maxY = Math.max(maxY, v.y);
                    });
                }
            });
            
            const width = maxX - minX;
            const height = maxY - minY;
            
            if (width === 0 || height === 0) {
                throw new Error('Некорректные размеры объектов в DXF');
            }
            
            // Создаём контур
            let contourPoints = [];
            
            // Если есть полилиния или окружность, используем её как контур
            const firstPolyOrCircle = dxfData.entities.find(e => 
                e.type === 'POLYLINE' || e.type === 'LWPOLYLINE' || e.type === 'CIRCLE'
            );
            
            if (firstPolyOrCircle) {
                if (firstPolyOrCircle.type === 'CIRCLE') {
                    const steps = 100;
                    for (let i = 0; i <= steps; i++) {
                        const angle = (i / steps) * 2 * Math.PI;
                        const x = firstPolyOrCircle.cx + firstPolyOrCircle.radius * Math.cos(angle);
                        const y = firstPolyOrCircle.cy + firstPolyOrCircle.radius * Math.sin(angle);
                        contourPoints.push({
                            x: (x - minX) / width,
                            y: (y - minY) / height
                        });
                    }
                } else {
                    firstPolyOrCircle.vertices.forEach(v => {
                        contourPoints.push({
                            x: (v.x - minX) / width,
                            y: (v.y - minY) / height
                        });
                    });
                }
            } else {
                // Если только линии, создаём контур из bounding box
                contourPoints = [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                    { x: 0, y: 1 }
                ];
            }
            
            if (contourPoints.length > 0) {
                this.originalContour = contourPoints;
            }
            
            // Создаём растровое представление
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            const resolution = 200;
            tempCanvas.width = resolution;
            tempCanvas.height = resolution;
            
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, resolution, resolution);
            
            // Рисуем все объекты
            tempCtx.fillStyle = 'black';
            tempCtx.strokeStyle = 'black';
            tempCtx.lineWidth = 2;
            
            dxfData.entities.forEach(entity => {
                if (entity.type === 'LINE') {
                    tempCtx.beginPath();
                    tempCtx.moveTo(
                        (entity.x1 - minX) / width * resolution, 
                        (entity.y1 - minY) / height * resolution
                    );
                    tempCtx.lineTo(
                        (entity.x2 - minX) / width * resolution, 
                        (entity.y2 - minY) / height * resolution
                    );
                    tempCtx.stroke();
                } else if (entity.type === 'CIRCLE') {
                    tempCtx.beginPath();
                    tempCtx.arc(
                        (entity.cx - minX) / width * resolution,
                        (entity.cy - minY) / height * resolution,
                        entity.radius / width * resolution,
                        0, 2 * Math.PI
                    );
                    tempCtx.fill();
                } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
                    tempCtx.beginPath();
                    entity.vertices.forEach((v, i) => {
                        const x = (v.x - minX) / width * resolution;
                        const y = (v.y - minY) / height * resolution;
                        if (i === 0) {
                            tempCtx.moveTo(x, y);
                        } else {
                            tempCtx.lineTo(x, y);
                        }
                    });
                    if (entity.closed) {
                        tempCtx.closePath();
                    }
                    tempCtx.fill();
                }
            });
            
            // Если это просто контур из линий (как квадрат), заполняем его
            if (dxfData.entities.length >= 3 && dxfData.entities.every(e => e.type === 'LINE')) {
                tempCtx.fillStyle = 'black';
                tempCtx.fillRect(0, 0, resolution, resolution);
            }
            
            // Создаём функцию проверки заполнения
            const imageData = tempCtx.getImageData(0, 0, resolution, resolution);
            this.originalDrawingFunction = (normalizedX, normalizedY) => {
                const x = Math.floor(normalizedX * resolution);
                const y = Math.floor(normalizedY * resolution);
                
                if (x < 0 || x >= resolution || y < 0 || y >= resolution) {
                    return false;
                }
                
                const index = (y * resolution + x) * 4;
                const r = imageData.data[index];
                
                // Считаем заполненным, если не белый
                return r < 128;
            };
            
            // Сбрасываем масштаб и применяем
            this.scale = 1.0;
            this.hasLoadedFile = true;
            document.getElementById('scaleSlider').value = 1.0;
            document.getElementById('scaleSection').style.display = 'block';
            this.applyScale();
            
            // Сохраняем реальные размеры файла
            this.fileWidthMM = width;
            this.fileHeightMM = height;
            
            document.getElementById('uploadInfo').textContent = 
                `Загружен: ${file.name} (${this.fileWidthMM.toFixed(1)}×${this.fileHeightMM.toFixed(1)} мм)`;
            document.getElementById('scaleValue').textContent = '100%';
            this.render();
            
        } catch (error) {
            console.error('Ошибка загрузки DXF:', error);
            alert('Ошибка загрузки DXF файла: ' + error.message);
        }
    }
    
    parseDXF(text) {
        // Простой парсер DXF
        const lines = text.split('\n').map(l => l.trim().replace('\r', ''));
        const entities = [];
        
        let i = 0;
        let inEntitiesSection = false;
        
        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];
            
            // Ищем секцию ENTITIES
            if (code === '0' && value === 'SECTION') {
                i += 2;
                if (i < lines.length && lines[i] === '2' && lines[i + 1] === 'ENTITIES') {
                    inEntitiesSection = true;
                    i += 2;
                    continue;
                }
            }
            
            // Парсим объекты в секции ENTITIES
            if (inEntitiesSection && code === '0') {
                if (value === 'ENDSEC') {
                    break;
                } else if (value === 'LINE') {
                    const line = this.parseDXFLine(lines, i);
                    if (line) entities.push(line);
                } else if (value === 'CIRCLE') {
                    const circle = this.parseDXFCircle(lines, i);
                    if (circle) entities.push(circle);
                } else if (value === 'POLYLINE' || value === 'LWPOLYLINE') {
                    const polyline = this.parseDXFPolyline(lines, i, value);
                    if (polyline) entities.push(polyline);
                }
            }
            
            i += 2;
        }
        
        return { entities };
    }
    
    parseDXFLine(lines, startIndex) {
        let x1, y1, x2, y2;
        let i = startIndex + 2;
        
        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];
            
            if (code === '0') break;
            
            if (code === '10') x1 = parseFloat(value);
            if (code === '20') y1 = parseFloat(value);
            if (code === '11') x2 = parseFloat(value);
            if (code === '21') y2 = parseFloat(value);
            
            i += 2;
        }
        
        if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
            return { type: 'LINE', x1, y1, x2, y2 };
        }
        return null;
    }
    
    parseDXFCircle(lines, startIndex) {
        let cx, cy, radius;
        let i = startIndex + 2;
        
        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];
            
            if (code === '0') break;
            
            if (code === '10') cx = parseFloat(value);
            if (code === '20') cy = parseFloat(value);
            if (code === '40') radius = parseFloat(value);
            
            i += 2;
        }
        
        if (cx !== undefined && cy !== undefined && radius !== undefined) {
            return { type: 'CIRCLE', cx, cy, radius };
        }
        return null;
    }
    
    parseDXFPolyline(lines, startIndex, entityType) {
        const vertices = [];
        let i = startIndex + 2;
        let closed = false;
        let currentVertex = {};
        
        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];
            
            if (code === '0') {
                if (value === 'VERTEX' || value === 'SEQEND') {
                    if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
                        vertices.push({ ...currentVertex });
                        currentVertex = {};
                    }
                    if (value === 'SEQEND') break;
                } else {
                    break;
                }
            }
            
            if (code === '10') currentVertex.x = parseFloat(value);
            if (code === '20') currentVertex.y = parseFloat(value);
            if (code === '70' && parseInt(value, 10) & 1) closed = true;
            
            i += 2;
        }
        
        if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
            vertices.push(currentVertex);
        }
        
        if (vertices.length > 0) {
            return { type: entityType, vertices, closed };
        }
        return null;
    }
    
    extractContourFromPath(pathElement, svgWidth, svgHeight, minX, minY) {
        const points = [];
        
        if (pathElement.tagName === 'path') {
            const d = pathElement.getAttribute('d');
            if (!d) return null;
            
            // Простой парсер path команд
            const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
            if (!commands) return null;
            
            let currentX = 0;
            let currentY = 0;
            
            commands.forEach(cmd => {
                const type = cmd[0];
                const coords = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
                
                if (type === 'M' || type === 'm') {
                    currentX = type === 'M' ? coords[0] : currentX + coords[0];
                    currentY = type === 'M' ? coords[1] : currentY + coords[1];
                    points.push({ 
                        x: (currentX - minX) / svgWidth, 
                        y: (currentY - minY) / svgHeight 
                    });
                } else if (type === 'L' || type === 'l') {
                    for (let i = 0; i < coords.length; i += 2) {
                        currentX = type === 'L' ? coords[i] : currentX + coords[i];
                        currentY = type === 'L' ? coords[i + 1] : currentY + coords[i + 1];
                        points.push({ 
                            x: (currentX - minX) / svgWidth, 
                            y: (currentY - minY) / svgHeight 
                        });
                    }
                }
            });
        } else if (pathElement.tagName === 'circle') {
            const cx = parseFloat(pathElement.getAttribute('cx')) || 0;
            const cy = parseFloat(pathElement.getAttribute('cy')) || 0;
            const r = parseFloat(pathElement.getAttribute('r')) || 0;
            
            for (let i = 0; i <= 100; i++) {
                const angle = (i / 100) * 2 * Math.PI;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                points.push({ 
                    x: (x - minX) / svgWidth, 
                    y: (y - minY) / svgHeight 
                });
            }
        } else if (pathElement.tagName === 'rect') {
            const x = parseFloat(pathElement.getAttribute('x')) || 0;
            const y = parseFloat(pathElement.getAttribute('y')) || 0;
            const w = parseFloat(pathElement.getAttribute('width')) || 0;
            const h = parseFloat(pathElement.getAttribute('height')) || 0;
            
            points.push({ x: (x - minX) / svgWidth, y: (y - minY) / svgHeight });
            points.push({ x: (x + w - minX) / svgWidth, y: (y - minY) / svgHeight });
            points.push({ x: (x + w - minX) / svgWidth, y: (y + h - minY) / svgHeight });
            points.push({ x: (x - minX) / svgWidth, y: (y + h - minY) / svgHeight });
        }
        
        return points.length > 0 ? points : null;
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
    
    initializeUI() {
        const widthInput = document.getElementById('pixelWidthInput');
        const heightInput = document.getElementById('pixelHeightInput');
        const widthSlider = document.getElementById('pixelWidthSlider');
        const heightSlider = document.getElementById('pixelHeightSlider');
        const scaleSlider = document.getElementById('scaleSlider');
        const fileUpload = document.getElementById('fileUpload');
        const workspaceWidthInput = document.getElementById('workspaceWidthInput');
        const workspaceHeightInput = document.getElementById('workspaceHeightInput');
        
        const updateSliderProgress = (slider) => {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const value = parseFloat(slider.value);
            const progress = ((value - min) / (max - min)) * 100;
            slider.style.setProperty('--slider-progress', `${progress}%`);
        };
        
        const updateWidth = (value) => {
            // Валидация
            if (isNaN(value) || value <= 0) value = 1.0;
            const min = 0.1;
            const max = 50;
            if (value < min) value = min;
            if (value > max) value = max;
            
            this.pixelWidthMM = value;
            
            // Синхронизация всех контролов
            widthInput.value = value.toFixed(3);
            if (value >= parseFloat(widthSlider.min) && value <= parseFloat(widthSlider.max)) {
                widthSlider.value = value;
                updateSliderProgress(widthSlider);
            }
            
            this.updateUI();
            this.render();
        };
        
        const updateHeight = (value) => {
            // Валидация
            if (isNaN(value) || value <= 0) value = 1.0;
            const min = 0.1;
            const max = 50;
            if (value < min) value = min;
            if (value > max) value = max;
            
            this.pixelHeightMM = value;
            
            // Синхронизация всех контролов
            heightInput.value = value.toFixed(3);
            if (value >= parseFloat(heightSlider.min) && value <= parseFloat(heightSlider.max)) {
                heightSlider.value = value;
                updateSliderProgress(heightSlider);
            }
            
            this.updateUI();
            this.render();
        };
        
        const clampWorkspaceSize = (value) => {
            if (isNaN(value) || value <= 0) return 10;
            const min = 10;
            const max = 1000;
            return Math.min(Math.max(value, min), max);
        };

        const updateWorkspaceWidth = (value) => {
            const normalized = clampWorkspaceSize(value);
            this.workspaceWidthMM = normalized;
            workspaceWidthInput.value = normalized.toFixed(1);
            this.setupCanvas();
            this.updateUI();
            this.render();
        };

        const updateWorkspaceHeight = (value) => {
            const normalized = clampWorkspaceSize(value);
            this.workspaceHeightMM = normalized;
            workspaceHeightInput.value = normalized.toFixed(1);
            this.setupCanvas();
            this.updateUI();
            this.render();
        };
        
        // Обработчики для текстового поля ширины
        // Убрали 'input' - валидация только при потере фокуса или Enter
        widthInput.addEventListener('blur', () => {
            updateWidth(parseFloat(widthInput.value));
        });
        
        widthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                widthInput.blur();
            }
        });
        
        // Обработчики для ползунка ширины
        widthSlider.addEventListener('input', (e) => {
            updateWidth(parseFloat(e.target.value));
        });
        
        // Обработчики для текстового поля высоты
        // Убрали 'input' - валидация только при потере фокуса или Enter
        heightInput.addEventListener('blur', () => {
            updateHeight(parseFloat(heightInput.value));
        });
        
        heightInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                heightInput.blur();
            }
        });
        
        // Обработчики для ползунка высоты
        heightSlider.addEventListener('input', (e) => {
            updateHeight(parseFloat(e.target.value));
        });
        
        // Обработчики для размеров рабочей области
        // Убрали 'input' - валидация только при потере фокуса или Enter
        workspaceWidthInput.addEventListener('blur', () => {
            updateWorkspaceWidth(parseFloat(workspaceWidthInput.value));
        });

        workspaceWidthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                workspaceWidthInput.blur();
            }
        });

        workspaceHeightInput.addEventListener('blur', () => {
            updateWorkspaceHeight(parseFloat(workspaceHeightInput.value));
        });

        workspaceHeightInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                workspaceHeightInput.blur();
            }
        });

        scaleSlider.addEventListener('input', (e) => {
            this.scale = parseFloat(e.target.value);
            updateSliderProgress(scaleSlider);
            document.getElementById('scaleValue').textContent = 
                `${Math.round(this.scale * 100)}%`;
            this.applyScale();
            this.render();
        });
        
        fileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const extension = file.name.split('.').pop().toLowerCase();
            
            if (extension === 'svg') {
                this.loadSVG(file);
            } else if (extension === 'dxf') {
                this.loadDXF(file);
            } else {
                alert('Пожалуйста, выберите SVG или DXF файл');
            }
        });
        
        // Инициализация прогресса ползунков
        updateSliderProgress(widthSlider);
        updateSliderProgress(heightSlider);
        updateSliderProgress(scaleSlider);
        this.updateUI();
    }
    
    updateUI() {
        // Вычисляем количество пикселей по каждой оси
        const gridWidth = Math.max(1, Math.floor(this.workspaceWidthMM / this.pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(this.workspaceHeightMM / this.pixelHeightMM));
        const totalPixels = gridWidth * gridHeight;
        
        document.getElementById('pixelDimensionsDisplay').textContent = 
            `${this.pixelWidthMM.toFixed(3)} × ${this.pixelHeightMM.toFixed(3)}`;
        document.getElementById('gridSize').textContent = `${gridWidth}×${gridHeight}`;
        document.getElementById('totalPixels').textContent = totalPixels.toLocaleString('ru-RU');
        document.getElementById('workspaceSize').textContent = 
            `${this.workspaceWidthMM.toFixed(1)}×${this.workspaceHeightMM.toFixed(1)} мм`;
    }
    
    render() {
        const ctx = this.ctx;
        const canvasWidth = this.currentCanvasWidth || this.canvas.width;
        const canvasHeight = this.currentCanvasHeight || this.canvas.height;
        
        // Очистка
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Вычисляем количество пикселей и их размеры в экранных координатах
        const gridWidth = Math.max(1, Math.floor(this.workspaceWidthMM / this.pixelWidthMM));
        const gridHeight = Math.max(1, Math.floor(this.workspaceHeightMM / this.pixelHeightMM));
        
        const pixelWidthPx = canvasWidth / gridWidth;
        const pixelHeightPx = canvasHeight / gridHeight;
        
        // Отрисовка пиксельной сетки и рисунка
        this.renderPixelGrid(gridWidth, gridHeight, pixelWidthPx, pixelHeightPx);
        
        // Отрисовка контура
        this.renderContour();
    }
    
    renderPixelGrid(gridWidth, gridHeight, pixelWidthPx, pixelHeightPx) {
        const ctx = this.ctx;
        
        // Вычисляем масштаб для преобразования координат файла в координаты рабочей области
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
            // Масштаб: размер файла относительно рабочей области
            scaleX = this.fileWidthMM / this.workspaceWidthMM;
            scaleY = this.fileHeightMM / this.workspaceHeightMM;
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
                
                if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
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
                const isFilled = this.originalDrawing(fileX, fileY);
                
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
    
    renderContour() {
        const ctx = this.ctx;
        const width = this.currentCanvasWidth || this.canvas.width;
        const height = this.currentCanvasHeight || this.canvas.height;
        
        // Вычисляем масштаб для преобразования координат файла в координаты рабочей области
        let scaleX = 1.0;
        let scaleY = 1.0;
        let offsetX = 0.0;
        let offsetY = 0.0;
        
        if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
            // Масштаб: размер файла относительно рабочей области
            scaleX = this.fileWidthMM / this.workspaceWidthMM;
            scaleY = this.fileHeightMM / this.workspaceHeightMM;
            // Центрируем файл в рабочей области
            offsetX = (1.0 - scaleX) / 2.0;
            offsetY = (1.0 - scaleY) / 2.0;
        }
        
        ctx.beginPath();
        
        this.contour.forEach((point, index) => {
            // Координаты точки в нормализованных координатах файла [0, 1]
            let fileX = point.x;
            let fileY = point.y;
            
            // Преобразуем координаты файла в координаты рабочей области
            let workspaceX = fileX;
            let workspaceY = fileY;
            
            if (this.hasLoadedFile && this.fileWidthMM && this.fileHeightMM) {
                workspaceX = offsetX + fileX * scaleX;
                workspaceY = offsetY + fileY * scaleY;
            }
            
            // Преобразуем в экранные координаты
            const x = workspaceX * width;
            const y = workspaceY * height;
            
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

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    new PixelGridDemo();
});
