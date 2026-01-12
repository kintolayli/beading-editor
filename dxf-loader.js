/**
 * Модуль для загрузки и парсинга DXF файлов
 */
class DXFLoader {
    /**
     * Загружает и обрабатывает DXF файл
     * @param {File} file - DXF файл
     * @returns {Promise<{contour: Array, drawingFunction: Function, width: number, height: number}>}
     */
    async loadDXF(file) {
        const text = await file.text();
        const dxfData = this.parseDXF(text);
        
        if (!dxfData.entities || dxfData.entities.length === 0) {
            throw new Error('DXF не содержит графических объектов');
        }
        
        // Находим bounding box всех объектов
        const bbox = this.calculateBoundingBox(dxfData.entities);
        const width = bbox.maxX - bbox.minX;
        const height = bbox.maxY - bbox.minY;
        
        if (width === 0 || height === 0) {
            throw new Error('Некорректные размеры объектов в DXF');
        }
        
        // Создаём контур
        const contour = this.extractContour(dxfData.entities, bbox);
        
        // Создаём растровое представление и функцию проверки заполнения
        const drawingFunction = this.createDrawingFunction(dxfData.entities, bbox);
        
        return {
            contour,
            drawingFunction,
            width,
            height
        };
    }
    
    /**
     * Вычисляет bounding box всех сущностей
     * @param {Array} entities - массив сущностей DXF
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    calculateBoundingBox(entities) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        entities.forEach(entity => {
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
        
        return { minX, minY, maxX, maxY };
    }
    
    /**
     * Извлекает контур из сущностей DXF
     * @param {Array} entities - массив сущностей DXF
     * @param {{minX: number, minY: number, maxX: number, maxY: number}} bbox - bounding box
     * @returns {Array} массив точек контура в нормализованных координатах [0, 1]
     */
    extractContour(entities, bbox) {
        const width = bbox.maxX - bbox.minX;
        const height = bbox.maxY - bbox.minY;
        let contourPoints = [];
        
        // Если есть полилиния или окружность, используем её как контур
        const firstPolyOrCircle = entities.find(e => 
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
                        x: (x - bbox.minX) / width,
                        y: (y - bbox.minY) / height
                    });
                }
            } else {
                firstPolyOrCircle.vertices.forEach(v => {
                    contourPoints.push({
                        x: (v.x - bbox.minX) / width,
                        y: (v.y - bbox.minY) / height
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
        
        return contourPoints;
    }
    
    /**
     * Создаёт функцию проверки заполнения на основе растрового представления
     * @param {Array} entities - массив сущностей DXF
     * @param {{minX: number, minY: number, maxX: number, maxY: number}} bbox - bounding box
     * @returns {Function} функция (normalizedX, normalizedY) => boolean
     */
    createDrawingFunction(entities, bbox) {
        const width = bbox.maxX - bbox.minX;
        const height = bbox.maxY - bbox.minY;
        const resolution = 200;
        
        // Создаём временный canvas для растрового представления
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = resolution;
        tempCanvas.height = resolution;
        
        // Очищаем белым
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, resolution, resolution);
        
        // Рисуем все объекты
        tempCtx.fillStyle = 'black';
        tempCtx.strokeStyle = 'black';
        tempCtx.lineWidth = 2;
        
        entities.forEach(entity => {
            if (entity.type === 'LINE') {
                tempCtx.beginPath();
                tempCtx.moveTo(
                    (entity.x1 - bbox.minX) / width * resolution, 
                    (entity.y1 - bbox.minY) / height * resolution
                );
                tempCtx.lineTo(
                    (entity.x2 - bbox.minX) / width * resolution, 
                    (entity.y2 - bbox.minY) / height * resolution
                );
                tempCtx.stroke();
            } else if (entity.type === 'CIRCLE') {
                tempCtx.beginPath();
                tempCtx.arc(
                    (entity.cx - bbox.minX) / width * resolution,
                    (entity.cy - bbox.minY) / height * resolution,
                    entity.radius / width * resolution,
                    0, 2 * Math.PI
                );
                tempCtx.fill();
            } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
                tempCtx.beginPath();
                entity.vertices.forEach((v, i) => {
                    const x = (v.x - bbox.minX) / width * resolution;
                    const y = (v.y - bbox.minY) / height * resolution;
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
        if (entities.length >= 3 && entities.every(e => e.type === 'LINE')) {
            tempCtx.fillStyle = 'black';
            tempCtx.fillRect(0, 0, resolution, resolution);
        }
        
        // Создаём функцию проверки заполнения
        const imageData = tempCtx.getImageData(0, 0, resolution, resolution);
        return (normalizedX, normalizedY) => {
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
    }
    
    /**
     * Парсит DXF файл и извлекает сущности
     * @param {string} text - содержимое DXF файла
     * @returns {{entities: Array}} объект с массивом сущностей
     */
    parseDXF(text) {
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
    
    /**
     * Парсит линию из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @returns {{type: string, x1: number, y1: number, x2: number, y2: number}|null}
     */
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
    
    /**
     * Парсит окружность из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @returns {{type: string, cx: number, cy: number, radius: number}|null}
     */
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
    
    /**
     * Парсит полилинию из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @param {string} entityType - тип сущности (POLYLINE или LWPOLYLINE)
     * @returns {{type: string, vertices: Array, closed: boolean}|null}
     */
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
}
