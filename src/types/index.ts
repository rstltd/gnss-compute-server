/**
 * GNSS 處理系統的類型定義
 */

import { GnssModel } from '../models/GnssModel';

// 處理選項介面
export interface ProcessingOptions {
    handlerTypes: string[];
    inputSys?: string;
    outputSys?: string;
    outlierSize?: number;
    medianSize?: number;
    lowessSize?: number;
    [key: string]: any;
}

// 欄位精度設定
export interface FieldPrecision {
    E: number;
    N: number; 
    H: number;
    angle: number;
    axis: number;
    plate: number;
    moveE: number;
    moveN: number;
    moveH: number;
    moveTotal: number;
    dayE: number;
    dayN: number;
    dayH: number;
}

// 環境變數介面
export interface Env {
    GNSS_QUEUE?: any;
    TASK_RESULTS?: any;
    GNSS_FILES?: any;
    EXTERNAL_WORKER_API_KEY?: string;
}

// 處理結果介面
export interface ProcessingResult {
    success: boolean;
    result?: string;
    stats?: ProcessingStats;
    error?: string;
}

// 處理統計介面
export interface ProcessingStats {
    totalPoints: number;
    processedPoints: number;
    filteredPoints: number;
    processingTime: number;
    [key: string]: any;
}

// 座標系統類型
export type CoordinateSystem = 'ecef' | 'wgs84' | 'twd97' | 'utm';

// 處理器類型
export type HandlerType = 
    | 'coordinateConvert'
    | 'dataOutliers' 
    | 'dataMedian'
    | 'dataLowess'
    | 'dataInterpolation'
    | 'dataAverage'
    | 'swcaCalculate'
    | 'parsePos'
    | 'formatXml';

// 輸出格式類型
export type OutputFormat = 'csv' | 'json' | 'xml';

// 重新導出 GnssModel
export { GnssModel };