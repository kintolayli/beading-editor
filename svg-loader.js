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
        const resolution = 800; // Разрешение для сэмплирования (увеличено с 200 для лучшей точности)
        tempCanvas.width = resolution;
        tempCanvas.height = resolution;
        
        // Отключаем антиалиасинг для более четких границ
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.imageSmoothingQuality = 'low';
        
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
        const BEZIER_STEPS = 20; // Количество точек для интерполяции кривых Безье
        
        // Функция для добавления точки в нормализованных координатах
        const addPoint = (x, y) => {
            points.push({ 
                x: (x - minX) / svgWidth, 
                y: (y - minY) / svgHeight 
            });
        };
        
        // Интерполяция кубической кривой Безье
        const cubicBezier = (p0, p1, p2, p3, t) => {
            const mt = 1 - t;
            return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
        };
        
        // Интерполяция квадратичной кривой Безье
        const quadraticBezier = (p0, p1, p2, t) => {
            const mt = 1 - t;
            return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
        };
        
        if (pathElement.tagName === 'path') {
            const d = pathElement.getAttribute('d');
            if (!d) return null;
            
            // Парсер path команд с поддержкой всех типов
            const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
            if (!commands) return null;
            
            let currentX = 0;
            let currentY = 0;
            let startX = 0;
            let startY = 0;
            let lastControlX = 0;
            let lastControlY = 0;
            let lastCommand = '';
            
            commands.forEach(cmd => {
                const type = cmd[0];
                const coords = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
                
                if (type === 'M' || type === 'm') {
                    currentX = type === 'M' ? coords[0] : currentX + coords[0];
                    currentY = type === 'M' ? coords[1] : currentY + coords[1];
                    startX = currentX;
                    startY = currentY;
                    addPoint(currentX, currentY);
                } else if (type === 'L' || type === 'l') {
                    for (let i = 0; i < coords.length; i += 2) {
                        currentX = type === 'L' ? coords[i] : currentX + coords[i];
                        currentY = type === 'L' ? coords[i + 1] : currentY + coords[i + 1];
                        addPoint(currentX, currentY);
                    }
                } else if (type === 'H' || type === 'h') {
                    // Горизонтальная линия
                    for (let i = 0; i < coords.length; i++) {
                        currentX = type === 'H' ? coords[i] : currentX + coords[i];
                        addPoint(currentX, currentY);
                    }
                } else if (type === 'V' || type === 'v') {
                    // Вертикальная линия
                    for (let i = 0; i < coords.length; i++) {
                        currentY = type === 'V' ? coords[i] : currentY + coords[i];
                        addPoint(currentX, currentY);
                    }
                } else if (type === 'C' || type === 'c') {
                    // Кубическая кривая Безье
                    for (let i = 0; i < coords.length; i += 6) {
                        const x1 = type === 'C' ? coords[i] : currentX + coords[i];
                        const y1 = type === 'C' ? coords[i + 1] : currentY + coords[i + 1];
                        const x2 = type === 'C' ? coords[i + 2] : currentX + coords[i + 2];
                        const y2 = type === 'C' ? coords[i + 3] : currentY + coords[i + 3];
                        const x3 = type === 'C' ? coords[i + 4] : currentX + coords[i + 4];
                        const y3 = type === 'C' ? coords[i + 5] : currentY + coords[i + 5];
                        
                        for (let t = 1; t <= BEZIER_STEPS; t++) {
                            const tt = t / BEZIER_STEPS;
                            const px = cubicBezier(currentX, x1, x2, x3, tt);
                            const py = cubicBezier(currentY, y1, y2, y3, tt);
                            addPoint(px, py);
                        }
                        
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x3;
                        currentY = y3;
                    }
                } else if (type === 'S' || type === 's') {
                    // Сглаженная кубическая кривая Безье
                    for (let i = 0; i < coords.length; i += 4) {
                        // Первая контрольная точка - отражение предыдущей
                        let x1 = currentX;
                        let y1 = currentY;
                        if (lastCommand === 'C' || lastCommand === 'c' || lastCommand === 'S' || lastCommand === 's') {
                            x1 = 2 * currentX - lastControlX;
                            y1 = 2 * currentY - lastControlY;
                        }
                        
                        const x2 = type === 'S' ? coords[i] : currentX + coords[i];
                        const y2 = type === 'S' ? coords[i + 1] : currentY + coords[i + 1];
                        const x3 = type === 'S' ? coords[i + 2] : currentX + coords[i + 2];
                        const y3 = type === 'S' ? coords[i + 3] : currentY + coords[i + 3];
                        
                        for (let t = 1; t <= BEZIER_STEPS; t++) {
                            const tt = t / BEZIER_STEPS;
                            const px = cubicBezier(currentX, x1, x2, x3, tt);
                            const py = cubicBezier(currentY, y1, y2, y3, tt);
                            addPoint(px, py);
                        }
                        
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x3;
                        currentY = y3;
                    }
                } else if (type === 'Q' || type === 'q') {
                    // Квадратичная кривая Безье
                    for (let i = 0; i < coords.length; i += 4) {
                        const x1 = type === 'Q' ? coords[i] : currentX + coords[i];
                        const y1 = type === 'Q' ? coords[i + 1] : currentY + coords[i + 1];
                        const x2 = type === 'Q' ? coords[i + 2] : currentX + coords[i + 2];
                        const y2 = type === 'Q' ? coords[i + 3] : currentY + coords[i + 3];
                        
                        for (let t = 1; t <= BEZIER_STEPS; t++) {
                            const tt = t / BEZIER_STEPS;
                            const px = quadraticBezier(currentX, x1, x2, tt);
                            const py = quadraticBezier(currentY, y1, y2, tt);
                            addPoint(px, py);
                        }
                        
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x2;
                        currentY = y2;
                    }
                } else if (type === 'T' || type === 't') {
                    // Сглаженная квадратичная кривая Безье
                    for (let i = 0; i < coords.length; i += 2) {
                        let x1 = currentX;
                        let y1 = currentY;
                        if (lastCommand === 'Q' || lastCommand === 'q' || lastCommand === 'T' || lastCommand === 't') {
                            x1 = 2 * currentX - lastControlX;
                            y1 = 2 * currentY - lastControlY;
                        }
                        
                        const x2 = type === 'T' ? coords[i] : currentX + coords[i];
                        const y2 = type === 'T' ? coords[i + 1] : currentY + coords[i + 1];
                        
                        for (let t = 1; t <= BEZIER_STEPS; t++) {
                            const tt = t / BEZIER_STEPS;
                            const px = quadraticBezier(currentX, x1, x2, tt);
                            const py = quadraticBezier(currentY, y1, y2, tt);
                            addPoint(px, py);
                        }
                        
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x2;
                        currentY = y2;
                    }
                } else if (type === 'A' || type === 'a') {
                    // Дуга (упрощённая аппроксимация точками)
                    for (let i = 0; i < coords.length; i += 7) {
                        const endX = type === 'A' ? coords[i + 5] : currentX + coords[i + 5];
                        const endY = type === 'A' ? coords[i + 6] : currentY + coords[i + 6];
                        
                        // Линейная интерполяция для упрощения (дуги сложны)
                        for (let t = 1; t <= BEZIER_STEPS; t++) {
                            const tt = t / BEZIER_STEPS;
                            const px = currentX + (endX - currentX) * tt;
                            const py = currentY + (endY - currentY) * tt;
                            addPoint(px, py);
                        }
                        
                        currentX = endX;
                        currentY = endY;
                    }
                } else if (type === 'Z' || type === 'z') {
                    // Закрыть путь
                    if (currentX !== startX || currentY !== startY) {
                        addPoint(startX, startY);
                    }
                    currentX = startX;
                    currentY = startY;
                }
                
                lastCommand = type;
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
