/**
 * Модуль для загрузки и обработки SVG файлов
 */
class SVGLoader {
    /**
     * Загружает и обрабатывает SVG файл
     * @param {File} file - SVG файл
     * @returns {Promise<{contour: Array, drawingFunction: Function, width: number, height: number}>}
     */
    async loadSVG(file) {
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
        
        // Создаём функцию проверки заполнения на основе растра
        const imageData = tempCtx.getImageData(0, 0, resolution, resolution);
        const drawingFunction = (normalizedX, normalizedY) => {
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
        
        return {
            contour: contourPoints || [],
            drawingFunction,
            width: svgWidth,
            height: svgHeight
        };
    }
    
    /**
     * Извлекает контур из SVG элемента
     * @param {Element} pathElement - SVG элемент (path, circle, rect и т.д.)
     * @param {number} svgWidth - ширина SVG
     * @param {number} svgHeight - высота SVG
     * @param {number} minX - минимальная X координата
     * @param {number} minY - минимальная Y координата
     * @returns {Array|null} массив точек контура в нормализованных координатах [0, 1]
     */
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
}
