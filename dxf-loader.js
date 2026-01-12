/**
 * Модуль для загрузки и парсинга DXF файлов
 * 
 * Поддерживаемые элементы DXF:
 * - LINE (линии)
 * - CIRCLE (окружности)
 * - ARC (дуги)
 * - POLYLINE / LWPOLYLINE (полилинии)
 * - ELLIPSE (эллипсы)
 * - SPLINE (сплайны)
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

        // Проверяем на Infinity и NaN
        if (!isFinite(bbox.minX) || !isFinite(bbox.minY) ||
            !isFinite(bbox.maxX) || !isFinite(bbox.maxY)) {
            throw new Error('Некорректные размеры объектов в DXF (Infinity или NaN)');
        }

        const width = bbox.maxX - bbox.minX;
        const height = bbox.maxY - bbox.minY;

        if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
            throw new Error('Некорректные размеры объектов в DXF (ширина или высота <= 0)');
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
        let hasValidEntity = false;

        entities.forEach(entity => {
            if (entity.type === 'LINE') {
                if (entity.x1 !== undefined && entity.y1 !== undefined &&
                    entity.x2 !== undefined && entity.y2 !== undefined &&
                    isFinite(entity.x1) && isFinite(entity.y1) &&
                    isFinite(entity.x2) && isFinite(entity.y2)) {
                    minX = Math.min(minX, entity.x1, entity.x2);
                    minY = Math.min(minY, entity.y1, entity.y2);
                    maxX = Math.max(maxX, entity.x1, entity.x2);
                    maxY = Math.max(maxY, entity.y1, entity.y2);
                    hasValidEntity = true;
                }
            } else if (entity.type === 'CIRCLE') {
                if (entity.cx !== undefined && entity.cy !== undefined &&
                    entity.radius !== undefined &&
                    isFinite(entity.cx) && isFinite(entity.cy) && isFinite(entity.radius)) {
                    minX = Math.min(minX, entity.cx - entity.radius);
                    minY = Math.min(minY, entity.cy - entity.radius);
                    maxX = Math.max(maxX, entity.cx + entity.radius);
                    maxY = Math.max(maxY, entity.cy + entity.radius);
                    hasValidEntity = true;
                }
            } else if (entity.type === 'ARC') {
                // Проверяем, что дуга имеет валидные параметры
                if (entity.cx !== undefined && entity.cy !== undefined &&
                    entity.radius !== undefined && entity.startAngle !== undefined &&
                    entity.endAngle !== undefined &&
                    isFinite(entity.cx) && isFinite(entity.cy) &&
                    isFinite(entity.radius) && isFinite(entity.startAngle) &&
                    isFinite(entity.endAngle) && entity.radius > 0) {
                    // Вычисляем bounding box для дуги
                    const arcBbox = this.calculateArcBoundingBox(entity);
                    if (isFinite(arcBbox.minX) && isFinite(arcBbox.minY) &&
                        isFinite(arcBbox.maxX) && isFinite(arcBbox.maxY)) {
                        minX = Math.min(minX, arcBbox.minX);
                        minY = Math.min(minY, arcBbox.minY);
                        maxX = Math.max(maxX, arcBbox.maxX);
                        maxY = Math.max(maxY, arcBbox.maxY);
                        hasValidEntity = true;
                    }
                }
            } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
                if (entity.vertices && entity.vertices.length > 0) {
                    entity.vertices.forEach(v => {
                        if (v.x !== undefined && v.y !== undefined &&
                            isFinite(v.x) && isFinite(v.y)) {
                            minX = Math.min(minX, v.x);
                            minY = Math.min(minY, v.y);
                            maxX = Math.max(maxX, v.x);
                            maxY = Math.max(maxY, v.y);
                            hasValidEntity = true;
                        }
                    });
                }
            } else if (entity.type === 'ELLIPSE') {
                // Упрощенный bounding box для эллипса
                if (entity.centerX !== undefined && entity.centerY !== undefined &&
                    entity.majorAxisLength !== undefined &&
                    isFinite(entity.centerX) && isFinite(entity.centerY) &&
                    isFinite(entity.majorAxisLength)) {
                    minX = Math.min(minX, entity.centerX - entity.majorAxisLength);
                    minY = Math.min(minY, entity.centerY - entity.majorAxisLength);
                    maxX = Math.max(maxX, entity.centerX + entity.majorAxisLength);
                    maxY = Math.max(maxY, entity.centerY + entity.majorAxisLength);
                    hasValidEntity = true;
                }
            } else if (entity.type === 'SPLINE') {
                // Bounding box для сплайна по контрольным точкам
                if (entity.controlPoints && entity.controlPoints.length > 0) {
                    entity.controlPoints.forEach(p => {
                        if (p.x !== undefined && p.y !== undefined &&
                            isFinite(p.x) && isFinite(p.y)) {
                            minX = Math.min(minX, p.x);
                            minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x);
                            maxY = Math.max(maxY, p.y);
                            hasValidEntity = true;
                        }
                    });
                }
            }
        });

        // Если не нашли валидных объектов, выбрасываем ошибку
        if (!hasValidEntity) {
            throw new Error('DXF не содержит валидных графических объектов');
        }

        // Если все еще Infinity, значит что-то пошло не так
        if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            throw new Error('Не удалось вычислить размеры объектов в DXF');
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Вычисляет bounding box для дуги
     * @param {Object} arc - объект дуги
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    calculateArcBoundingBox(arc) {
        // Генерируем точки дуги и находим min/max
        const points = this.generateArcPoints(arc, 50);

        if (points.length === 0) {
            return {
                minX: arc.cx - arc.radius,
                minY: arc.cy - arc.radius,
                maxX: arc.cx + arc.radius,
                maxY: arc.cy + arc.radius
            };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
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

        // Проверяем, есть ли окружность
        const circle = entities.find(e => e.type === 'CIRCLE');
        if (circle) {
            const steps = 100;
            for (let i = 0; i <= steps; i++) {
                const angle = (i / steps) * 2 * Math.PI;
                const x = circle.cx + circle.radius * Math.cos(angle);
                const y = circle.cy + circle.radius * Math.sin(angle);
                contourPoints.push({
                    x: (x - bbox.minX) / width,
                    y: (y - bbox.minY) / height
                });
            }
            return contourPoints;
        }

        // Проверяем, есть ли полилиния
        const polyline = entities.find(e => e.type === 'POLYLINE' || e.type === 'LWPOLYLINE');
        if (polyline) {
            polyline.vertices.forEach(v => {
                contourPoints.push({
                    x: (v.x - bbox.minX) / width,
                    y: (v.y - bbox.minY) / height
                });
            });
            return contourPoints;
        }

        // Собираем все дуги и линии в сегменты с начальной и конечной точками
        const segments = this.extractSegments(entities);

        if (segments.length > 0) {
            // Соединяем сегменты в замкнутый контур
            const orderedSegments = this.orderSegments(segments);

            // Генерируем точки контура из упорядоченных сегментов
            orderedSegments.forEach(segment => {
                segment.points.forEach(p => {
                    contourPoints.push({
                        x: (p.x - bbox.minX) / width,
                        y: (p.y - bbox.minY) / height
                    });
                });
            });
        }

        // Если контур пустой, используем bounding box
        if (contourPoints.length === 0) {
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
     * Извлекает сегменты из сущностей DXF
     * @param {Array} entities - массив сущностей
     * @returns {Array} массив сегментов с точками и конечными координатами
     */
    extractSegments(entities) {
        const segments = [];

        entities.forEach(entity => {
            if (entity.type === 'LINE') {
                segments.push({
                    type: 'LINE',
                    startX: entity.x1,
                    startY: entity.y1,
                    endX: entity.x2,
                    endY: entity.y2,
                    points: [
                        { x: entity.x1, y: entity.y1 },
                        { x: entity.x2, y: entity.y2 }
                    ]
                });
            } else if (entity.type === 'ARC') {
                const points = this.generateArcPoints(entity, 30);
                if (points.length > 0) {
                    segments.push({
                        type: 'ARC',
                        startX: points[0].x,
                        startY: points[0].y,
                        endX: points[points.length - 1].x,
                        endY: points[points.length - 1].y,
                        points: points
                    });
                }
            }
        });

        return segments;
    }

    /**
     * Генерирует точки для дуги
     * @param {Object} arc - объект дуги
     * @param {number} steps - количество точек
     * @returns {Array} массив точек
     */
    generateArcPoints(arc, steps) {
        const points = [];
        let startRad = (arc.startAngle * Math.PI) / 180;
        let endRad = (arc.endAngle * Math.PI) / 180;

        // Нормализуем углы в диапазон [0, 2*PI]
        startRad = startRad % (2 * Math.PI);
        if (startRad < 0) startRad += 2 * Math.PI;
        endRad = endRad % (2 * Math.PI);
        if (endRad < 0) endRad += 2 * Math.PI;

        // Вычисляем длину дуги (против часовой стрелки)
        let arcLength = endRad - startRad;
        if (arcLength < 0) arcLength += 2 * Math.PI;

        // Если дуга очень маленькая или нулевая, делаем минимальную длину
        if (arcLength < 0.001) {
            arcLength = 2 * Math.PI; // Полная окружность
        }

        const numSteps = Math.max(steps, Math.floor(arcLength * 30 / (2 * Math.PI)));

        // Минимум 2 точки для любой дуги
        const actualSteps = Math.max(2, numSteps);

        for (let i = 0; i <= actualSteps; i++) {
            const t = i / actualSteps;
            const angle = startRad + t * arcLength;
            const x = arc.cx + arc.radius * Math.cos(angle);
            const y = arc.cy + arc.radius * Math.sin(angle);
            if (isFinite(x) && isFinite(y)) {
                points.push({ x, y });
            }
        }

        return points;
    }

    /**
     * Упорядочивает сегменты в связный контур
     * @param {Array} segments - массив сегментов
     * @returns {Array} упорядоченный массив сегментов
     */
    orderSegments(segments) {
        if (segments.length === 0) return [];
        if (segments.length === 1) return segments;

        const tolerance = 0.5; // Допуск для сравнения координат (в единицах DXF)
        const ordered = [];
        const used = new Set();

        // Начинаем с первого сегмента
        ordered.push(segments[0]);
        used.add(0);

        let currentEndX = segments[0].endX;
        let currentEndY = segments[0].endY;

        while (ordered.length < segments.length) {
            let foundNext = false;

            for (let i = 0; i < segments.length; i++) {
                if (used.has(i)) continue;

                const seg = segments[i];

                // Проверяем, соединяется ли начало сегмента с текущим концом
                if (Math.abs(seg.startX - currentEndX) < tolerance &&
                    Math.abs(seg.startY - currentEndY) < tolerance) {
                    ordered.push(seg);
                    used.add(i);
                    currentEndX = seg.endX;
                    currentEndY = seg.endY;
                    foundNext = true;
                    break;
                }

                // Проверяем, соединяется ли конец сегмента с текущим концом (обратное направление)
                if (Math.abs(seg.endX - currentEndX) < tolerance &&
                    Math.abs(seg.endY - currentEndY) < tolerance) {
                    // Разворачиваем сегмент
                    const reversedSeg = {
                        ...seg,
                        startX: seg.endX,
                        startY: seg.endY,
                        endX: seg.startX,
                        endY: seg.startY,
                        points: [...seg.points].reverse()
                    };
                    ordered.push(reversedSeg);
                    used.add(i);
                    currentEndX = reversedSeg.endX;
                    currentEndY = reversedSeg.endY;
                    foundNext = true;
                    break;
                }
            }

            if (!foundNext) {
                // Не нашли следующий сегмент, добавляем оставшиеся как есть
                for (let i = 0; i < segments.length; i++) {
                    if (!used.has(i)) {
                        ordered.push(segments[i]);
                        used.add(i);
                    }
                }
                break;
            }
        }

        return ordered;
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
        const resolution = RASTERIZATION_RESOLUTION;

        // Создаём временный canvas для растрового представления
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = resolution;
        tempCanvas.height = resolution;

        // Отключаем антиалиасинг для более четких границ
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.imageSmoothingQuality = 'low';

        // Очищаем белым
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, resolution, resolution);

        tempCtx.fillStyle = 'black';
        tempCtx.strokeStyle = 'black';
        tempCtx.lineWidth = 2;

        // Проверяем, есть ли полилиния или окружность (простые замкнутые фигуры)
        const circle = entities.find(e => e.type === 'CIRCLE');
        if (circle) {
            tempCtx.beginPath();
            tempCtx.arc(
                (circle.cx - bbox.minX) / width * resolution,
                (circle.cy - bbox.minY) / height * resolution,
                circle.radius / width * resolution,
                0, 2 * Math.PI
            );
            tempCtx.fill();
        }

        // Обрабатываем полилинии (замкнутые и незамкнутые)
        const polylines = entities.filter(e => e.type === 'POLYLINE' || e.type === 'LWPOLYLINE');
        let hasPolylines = false;

        polylines.forEach((polyline, polyIdx) => {
            if (polyline.vertices && polyline.vertices.length > 0) {
                hasPolylines = true;
                tempCtx.beginPath();
                let firstX = null, firstY = null;
                let minCanvasX = Infinity, minCanvasY = Infinity, maxCanvasX = -Infinity, maxCanvasY = -Infinity;

                // Рисуем вершины в правильном порядке
                // Нормализуем координаты относительно bbox, затем масштабируем на resolution
                polyline.vertices.forEach((v, i) => {
                    // Нормализуем координаты от 0 до 1 относительно bbox
                    const normalizedX = (v.x - bbox.minX) / width;
                    const normalizedY = (v.y - bbox.minY) / height;

                    // Масштабируем на resolution
                    const x = normalizedX * resolution;
                    const y = normalizedY * resolution;

                    minCanvasX = Math.min(minCanvasX, x);
                    minCanvasY = Math.min(minCanvasY, y);
                    maxCanvasX = Math.max(maxCanvasX, x);
                    maxCanvasY = Math.max(maxCanvasY, y);

                    if (i === 0) {
                        firstX = x;
                        firstY = y;
                        tempCtx.moveTo(x, y);
                    } else {
                        tempCtx.lineTo(x, y);
                    }
                });
                // Закрываем контур только если полилиния помечена как замкнутая
                if (polyline.closed) {
                    // Проверяем, что контур действительно замкнут (первая и последняя точки близки)
                    const lastV = polyline.vertices[polyline.vertices.length - 1];
                    const firstV = polyline.vertices[0];
                    const dist = Math.sqrt(Math.pow(lastV.x - firstV.x, 2) + Math.pow(lastV.y - firstV.y, 2));
                    if (dist > 0.001) {
                        // Если первая и последняя точки не совпадают, замыкаем контур
                        if (firstX !== null && firstY !== null) {
                            tempCtx.lineTo(firstX, firstY);
                        }
                    }
                    tempCtx.closePath();
                }
                // Используем fill для заполнения области (только для замкнутых контуров)
                if (polyline.closed) {
                    tempCtx.fill();
                }
                // Рисуем обводку для всех полилиний
                tempCtx.stroke();
            }
        });

        // Собираем все сегменты и создаем замкнутый контур (только если нет полилиний)
        // Полилинии уже обработаны выше
        const segments = hasPolylines ? [] : this.extractSegments(entities);

        if (segments.length > 0) {
            const orderedSegments = this.orderSegments(segments);

            // Рисуем замкнутый контур из упорядоченных сегментов
            tempCtx.beginPath();
            let isFirst = true;

            orderedSegments.forEach(segment => {
                segment.points.forEach((p, i) => {
                    const x = (p.x - bbox.minX) / width * resolution;
                    const y = (p.y - bbox.minY) / height * resolution;

                    if (isFirst) {
                        tempCtx.moveTo(x, y);
                        isFirst = false;
                    } else {
                        tempCtx.lineTo(x, y);
                    }
                });
            });

            tempCtx.closePath();
            tempCtx.fill();
        }

        // Дополнительно рисуем эллипсы и сплайны
        entities.forEach(entity => {
            if (entity.type === 'ELLIPSE') {
                tempCtx.beginPath();
                tempCtx.ellipse(
                    (entity.centerX - bbox.minX) / width * resolution,
                    (entity.centerY - bbox.minY) / height * resolution,
                    entity.majorAxisLength / width * resolution,
                    entity.minorAxisLength / height * resolution,
                    entity.rotation || 0,
                    0, 2 * Math.PI
                );
                tempCtx.fill();
            } else if (entity.type === 'SPLINE' && entity.closed) {
                if (entity.controlPoints && entity.controlPoints.length > 0) {
                    tempCtx.beginPath();
                    entity.controlPoints.forEach((p, i) => {
                        const x = (p.x - bbox.minX) / width * resolution;
                        const y = (p.y - bbox.minY) / height * resolution;
                        if (i === 0) {
                            tempCtx.moveTo(x, y);
                        } else {
                            tempCtx.lineTo(x, y);
                        }
                    });
                    tempCtx.closePath();
                    tempCtx.fill();
                }
            }
        });

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
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];

            // Считаем заполненным, если не белый (проверяем все каналы для надежности)
            return r < 200 && g < 200 && b < 200;
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
                } else if (value === 'ARC') {
                    const arc = this.parseDXFArc(lines, i);
                    if (arc) entities.push(arc);
                } else if (value === 'POLYLINE' || value === 'LWPOLYLINE') {
                    const polyline = this.parseDXFPolyline(lines, i, value);
                    if (polyline) entities.push(polyline);
                } else if (value === 'ELLIPSE') {
                    const ellipse = this.parseDXFEllipse(lines, i);
                    if (ellipse) entities.push(ellipse);
                } else if (value === 'SPLINE') {
                    const spline = this.parseDXFSpline(lines, i);
                    if (spline) entities.push(spline);
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

        // LWPOLYLINE имеет другой формат - координаты идут парами 10/20 без VERTEX объектов
        if (entityType === 'LWPOLYLINE') {
            while (i < lines.length) {
                const code = lines[i];
                const value = lines[i + 1];

                if (code === '0') {
                    // Конец текущей сущности
                    if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
                        vertices.push({ ...currentVertex });
                        currentVertex = {};
                    }
                    break;
                }

                if (code === '10') {
                    // Если уже есть вершина с координатами, сохраняем её
                    if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
                        vertices.push({ ...currentVertex });
                    }
                    currentVertex = { x: parseFloat(value) };
                }
                if (code === '20' && currentVertex.x !== undefined) {
                    currentVertex.y = parseFloat(value);
                    // Вершина готова, но не сохраняем здесь - сохраним при следующем code 10 или в конце
                }
                if (code === '70') {
                    const flags = parseInt(value, 10);
                    closed = (flags & 1) !== 0; // Бит 0 = закрытая полилиния
                }

                i += 2;
            }

            // Сохраняем последнюю вершину, если она есть
            if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
                vertices.push(currentVertex);
            }
        } else {
            // POLYLINE - старый формат с VERTEX объектами
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
        }

        if (vertices.length > 0) {
            return { type: entityType, vertices, closed };
        }
        return null;
    }

    /**
     * Парсит дугу из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @returns {{type: string, cx: number, cy: number, radius: number, startAngle: number, endAngle: number}|null}
     */
    parseDXFArc(lines, startIndex) {
        let cx, cy, radius, startAngle, endAngle;
        let i = startIndex + 2;

        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];

            if (code === '0') break;

            if (code === '10') cx = parseFloat(value);
            if (code === '20') cy = parseFloat(value);
            if (code === '40') radius = parseFloat(value);
            if (code === '50') startAngle = parseFloat(value); // Начальный угол в градусах
            if (code === '51') endAngle = parseFloat(value);   // Конечный угол в градусах

            i += 2;
        }

        if (cx !== undefined && cy !== undefined && radius !== undefined &&
            startAngle !== undefined && endAngle !== undefined) {
            return { type: 'ARC', cx, cy, radius, startAngle, endAngle };
        }
        return null;
    }

    /**
     * Парсит эллипс из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @returns {{type: string, centerX: number, centerY: number, majorAxisLength: number, minorAxisLength: number, rotation: number}|null}
     */
    parseDXFEllipse(lines, startIndex) {
        let centerX, centerY, majorAxisX, majorAxisY, ratio, startParam, endParam;
        let i = startIndex + 2;

        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];

            if (code === '0') break;

            if (code === '10') centerX = parseFloat(value);
            if (code === '20') centerY = parseFloat(value);
            if (code === '11') majorAxisX = parseFloat(value);
            if (code === '21') majorAxisY = parseFloat(value);
            if (code === '40') ratio = parseFloat(value); // Отношение малой оси к большой
            if (code === '41') startParam = parseFloat(value);
            if (code === '42') endParam = parseFloat(value);

            i += 2;
        }

        if (centerX !== undefined && centerY !== undefined &&
            majorAxisX !== undefined && majorAxisY !== undefined && ratio !== undefined) {
            const majorAxisLength = Math.sqrt(majorAxisX * majorAxisX + majorAxisY * majorAxisY);
            const minorAxisLength = majorAxisLength * ratio;
            const rotation = Math.atan2(majorAxisY, majorAxisX);

            return {
                type: 'ELLIPSE',
                centerX,
                centerY,
                majorAxisLength,
                minorAxisLength,
                rotation,
                startParam: startParam || 0,
                endParam: endParam || 2 * Math.PI
            };
        }
        return null;
    }

    /**
     * Парсит сплайн из DXF
     * @param {Array} lines - массив строк DXF
     * @param {number} startIndex - начальный индекс
     * @returns {{type: string, controlPoints: Array, closed: boolean}|null}
     */
    parseDXFSpline(lines, startIndex) {
        const controlPoints = [];
        let i = startIndex + 2;
        let closed = false;
        let currentPoint = {};
        let inControlPoints = false;

        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1];

            if (code === '0') {
                if (value === 'SPLINE') {
                    // Начало нового сплайна или продолжение
                    if (currentPoint.x !== undefined && currentPoint.y !== undefined) {
                        controlPoints.push({ ...currentPoint });
                        currentPoint = {};
                    }
                } else if (value === 'ENDSEC' || value === 'LINE' || value === 'CIRCLE' ||
                    value === 'ARC' || value === 'POLYLINE' || value === 'LWPOLYLINE' ||
                    value === 'ELLIPSE') {
                    break;
                }
            }

            if (code === '10') {
                if (currentPoint.x !== undefined && currentPoint.y !== undefined) {
                    controlPoints.push({ ...currentPoint });
                }
                currentPoint = { x: parseFloat(value) };
                inControlPoints = true;
            }
            if (code === '20' && inControlPoints) {
                currentPoint.y = parseFloat(value);
            }
            if (code === '70') {
                const flags = parseInt(value, 10);
                closed = (flags & 1) !== 0; // Бит 0 = закрытый сплайн
            }

            i += 2;
        }

        if (currentPoint.x !== undefined && currentPoint.y !== undefined) {
            controlPoints.push(currentPoint);
        }

        if (controlPoints.length > 0) {
            return { type: 'SPLINE', controlPoints, closed };
        }
        return null;
    }
}
