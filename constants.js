/**
 * Константы приложения Beading Studio
 */

// Пороги заполнения
const DEFAULT_FILL_THRESHOLD = 0.25; // 75% в UI (инвертированная логика)
const MIN_FILL_THRESHOLD = 0;
const MAX_FILL_THRESHOLD = 1;

// Разрешение растеризации
const RASTERIZATION_RESOLUTION = 800;

// Интерполяция кривых Безье
const BEZIER_STEPS = 20;

// Размеры по умолчанию
const DEFAULT_WORKSPACE_WIDTH_MM = 150;
const DEFAULT_WORKSPACE_HEIGHT_MM = 150;
const DEFAULT_PIXEL_WIDTH_MM = 3.1;
const DEFAULT_PIXEL_HEIGHT_MM = 3.1;

// Ограничения
const MIN_WORKSPACE_SIZE_MM = 10;
const MAX_WORKSPACE_SIZE_MM = 500;
const MIN_PIXEL_SIZE_MM = 0.1;
const MAX_PIXEL_SIZE_MM = 50;
const MIN_SCALE = 0.1;
const MAX_SCALE = 3.0;
const MIN_GRID_OFFSET_MM = -10;
const MAX_GRID_OFFSET_MM = 10;

// Размер сетки для сэмплирования
const SAMPLE_GRID_SIZE = 5;

// Порог для сравнения масштаба (для проверки равенства 1.0)
const SCALE_EPSILON = 0.0001;
