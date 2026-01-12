/**
 * Утилиты для валидации входных данных
 */
class Validator {
    /**
     * Ограничивает значение в заданном диапазоне
     * @param {number} value - значение для ограничения
     * @param {number} min - минимальное значение
     * @param {number} max - максимальное значение
     * @returns {number} ограниченное значение
     */
    static clamp(value, min, max) {
        if (!this.isValidNumber(value)) {
            return min;
        }
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * Проверяет, является ли значение валидным числом
     * @param {*} value - значение для проверки
     * @returns {boolean} true если значение валидное число
     */
    static isValidNumber(value) {
        return typeof value === 'number' && isFinite(value) && !isNaN(value);
    }
    
    /**
     * Валидирует размер рабочей области
     * @param {number} value - значение для валидации
     * @returns {number} валидированное значение
     */
    static validateWorkspaceSize(value) {
        return this.clamp(value, MIN_WORKSPACE_SIZE_MM, MAX_WORKSPACE_SIZE_MM);
    }
    
    /**
     * Валидирует размер бисеринки
     * @param {number} value - значение для валидации
     * @returns {number} валидированное значение
     */
    static validatePixelSize(value) {
        return this.clamp(value, MIN_PIXEL_SIZE_MM, MAX_PIXEL_SIZE_MM);
    }
    
    /**
     * Валидирует масштаб
     * @param {number} value - значение для валидации
     * @returns {number} валидированное значение
     */
    static validateScale(value) {
        return this.clamp(value, MIN_SCALE, MAX_SCALE);
    }
    
    /**
     * Валидирует порог заполнения
     * @param {number} value - значение для валидации (0-1)
     * @returns {number} валидированное значение
     */
    static validateFillThreshold(value) {
        return this.clamp(value, MIN_FILL_THRESHOLD, MAX_FILL_THRESHOLD);
    }
    
    /**
     * Валидирует смещение сетки
     * @param {number} value - значение для валидации
     * @returns {number} валидированное значение
     */
    static validateGridOffset(value) {
        return this.clamp(value, MIN_GRID_OFFSET_MM, MAX_GRID_OFFSET_MM);
    }
    
    /**
     * Очищает имя файла от опасных символов
     * @param {string} fileName - имя файла
     * @returns {string} очищенное имя файла
     */
    static sanitizeFileName(fileName) {
        if (typeof fileName !== 'string') {
            return 'project';
        }
        // Удаляем опасные символы
        return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'project';
    }
    
    /**
     * Валидирует размер файла
     * @param {number} fileSize - размер файла в байтах
     * @param {number} maxSize - максимальный размер в байтах (по умолчанию 50MB)
     * @returns {{valid: boolean, error?: string}}
     */
    static validateFileSize(fileSize, maxSize = 50 * 1024 * 1024) {
        if (!this.isValidNumber(fileSize)) {
            return { valid: false, error: 'Некорректный размер файла' };
        }
        if (fileSize > maxSize) {
            const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
            const maxMB = (maxSize / 1024 / 1024).toFixed(0);
            return { 
                valid: false, 
                error: `Файл слишком большой (${sizeMB}MB). Максимальный размер: ${maxMB}MB` 
            };
        }
        return { valid: true };
    }
}
