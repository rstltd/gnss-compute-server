import { CoordinateConvertHandler } from '../handlers/CoordinateConvertHandler';
import { DataOutliersHandler } from '../handlers/DataOutliersHandler';
import { DataMedianHandler } from '../handlers/DataMedianHandler';
import { DataLowessHandler } from '../handlers/DataLowessHandler';
import { DataInterpolationHandler } from '../handlers/DataInterpolationHandler';
import { SwcaCalculateHandler } from '../handlers/SwcaCalculateHandler';
import { XmlFormatterHandler } from '../handlers/XmlFormatterHandler';
import { DataAverageHandler } from '../handlers/DataAverageHandler';
import { PosDataProcessor } from '../processors/PosDataProcessor';
import { GnssModel } from '../models/GnssModel';
import { ProcessingOptions, FieldPrecision, Env } from '../types/index';

function formatDateTime(dateTimeString: string): string {
    const date = new Date(dateTimeString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function modelsToCsv(data: GnssModel[], customPrecision?: Partial<FieldPrecision>): string {
    const header =
        'date_time,E,N,H,Angle,Axis,Plate,EMove,NMove,HMove,TotalMove,EDay,NDay,HDay';
    
    // Default precision settings for different field types
    const defaultPrecision: FieldPrecision = {
        E: 4,          // Coordinate values - 4 decimal places
        N: 4,          // Coordinate values - 4 decimal places  
        H: 4,          // Height values - 4 decimal places
        angle: 1,      // Angle values - 1 decimal place
        axis: 1,       // Axis displacement - 1 decimal place
        plate: 1,      // Plate displacement - 1 decimal place
        moveE: 1,      // Movement values - 1 decimal place
        moveN: 1,      // Movement values - 1 decimal place
        moveH: 1,      // Movement values - 1 decimal place
        moveTotal: 1,  // Total movement - 1 decimal place
        dayE: 4,       // Daily average coordinates - 4 decimal places
        dayN: 4,       // Daily average coordinates - 4 decimal places
        dayH: 4,       // Daily average coordinates - 4 decimal places
    };
    
    const precision = { ...defaultPrecision, ...customPrecision };
    
    const formatNumber = (value: number | undefined, decimals: number): string => {
        if (value === undefined || value === null || isNaN(value)) return '';
        return value.toFixed(decimals);
    };
    
    const rows = data.map((d) =>
        [
            formatDateTime(d.dateTime),
            formatNumber(d.E, precision.E),
            formatNumber(d.N, precision.N),
            formatNumber(d.H, precision.H),
            formatNumber(d.angle, precision.angle),
            formatNumber(d.axis, precision.axis),
            formatNumber(d.plate, precision.plate),
            formatNumber(d.moveE, precision.moveE),
            formatNumber(d.moveN, precision.moveN),
            formatNumber(d.moveH, precision.moveH),
            formatNumber(d.moveTotal, precision.moveTotal),
            formatNumber(d.dayE, precision.dayE),
            formatNumber(d.dayN, precision.dayN),
            formatNumber(d.dayH, precision.dayH),
        ].join(',')
    );
    return [header, ...rows].join('\n');
}

/**
 * GNSS數據處理服務
 * 負責執行各種GNSS數據處理算法
 */
export class GnssProcessor {

    /**
     * 處理特殊的POS檔案加權平均計算
     */
    static processPosWeightedAverage(posContent: string): { success: boolean; result?: any; stats?: any; error?: string } {
        const processor = new PosDataProcessor();
        const result = processor.process(posContent);
        const stats = processor.getStats();

        if (result) {
            return { success: true, result, stats };
        } else {
            return { 
                success: false, 
                error: 'No valid data found or processing failed',
                stats 
            };
        }
    }

    
    /**
     * 解析 GNSS 內容的輔助方法
     */
    static parseGnssContent(posContent: string): GnssModel[] {
        const lines = posContent.split('\n');
        const data: GnssModel[] = [];
        
        for (const line of lines) {
            if (line.trim() === '' || line.startsWith('%') || line.startsWith('#')) {
                continue; // 跳過空行和註解行
            }
            
            // 解析 .pos 檔案格式: YYYY/MM/DD HH:MM:SS.SSS   X(m)      Y(m)      Z(m)   Q  ns   sdn(m)   sde(m)   sdu(m)
            const parts = line.trim().split(/\s+/);
            
            if (parts.length >= 4) {
                try {
                    const dateTime = parts[0] + ' ' + parts[1];
                    const x = parseFloat(parts[2]);
                    const y = parseFloat(parts[3]);  
                    const z = parseFloat(parts[4]);
                    
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                        data.push({
                            dateTime: dateTime,
                            E: x, // 東向座標
                            N: y, // 北向座標  
                            H: z, // 高程
                            latitude: 0, // 將通過座標轉換計算
                            longitude: 0, // 將通過座標轉換計算
                            height: z,
                            angle: 0,
                            axis: 0,
                            plate: 0,
                            moveE: 0,
                            moveN: 0,
                            moveH: 0,
                            moveTotal: 0,
                            dayE: x,
                            dayN: y,
                            dayH: z
                        });
                    }
                } catch (error) {
                    console.warn('解析行時出錯:', line);
                }
            }
        }
        
        console.log(`📊 解析 .pos 檔案: ${data.length} 個有效數據點`);
        return data;
    }
    
    /**
     * 從 .pos 內容開始的完整處理流程
     */
    static async processFromPosContent(
        posContent: string,
        options: ProcessingOptions
    ): Promise<{ result: string; contentType: string }> {
        // 1. 解析 .pos 檔案內容
        const parsedData = this.parseGnssContent(posContent);
        
        if (parsedData.length === 0) {
            throw new Error('無法從 .pos 檔案中解析到有效數據');
        }
        
        // 2. 執行標準處理流程
        return this.processGnssData(parsedData, options);
    }

    /**
     * 處理標準的GNSS數據處理流程 (本地運算)
     */
    static async processGnssData(
        parsedData: GnssModel[], 
        options: ProcessingOptions
    ): Promise<{ result: string; contentType: string }> {
        
        const { handlerTypes } = options;
        
        // 如果只是解析POS檔案
        if (handlerTypes.length === 1 && handlerTypes[0] === 'parsePos') {
            return {
                result: JSON.stringify(parsedData),
                contentType: 'application/json'
            };
        }

        let resultModels: GnssModel[] = parsedData;
        let xmlResult = '';

        // 依序執行所有處理器
        for (const type of handlerTypes) {
            switch (type) {
                case 'coordinateConvert': {
                    const inputSys = options.inputSys || 'ecef';  // 預設值
                    const outputSys = options.outputSys || 'wgs84';  // 預設值
                    const h = new CoordinateConvertHandler(inputSys, outputSys);
                    resultModels = resultModels.map(d => h.convert(d));
                    break;
                }
                case 'dataOutliers': {
                    const h = new DataOutliersHandler(resultModels);
                    resultModels = h.calculate(options.outlierSize || 145);
                    break;
                }
                case 'dataMedian': {
                    const h = new DataMedianHandler(resultModels);
                    resultModels = h.calculate(options.medianSize || 37);
                    break;
                }
                case 'dataLowess': {
                    const h = new DataLowessHandler(resultModels);
                    resultModels = h.calculate(options.lowessSize || 36);
                    break;
                }
                case 'dataInterpolation': {
                    const h = new DataInterpolationHandler(resultModels);
                    resultModels = h.interpolationData();
                    break;
                }
                case 'dataAverage': {
                    const h = new DataAverageHandler(resultModels);
                    resultModels = h.calculate();
                    break;
                }
                case 'swcaCalculate': {
                    const h = new SwcaCalculateHandler(resultModels);
                    resultModels = h.calculateSwca();
                    break;
                }
                case 'parsePos':
                    // already parsed; ignore
                    break;
                default:
                    throw new Error('Unknown handler type: ' + type);
            }
        }

        if (xmlResult) {
            return {
                result: xmlResult,
                contentType: 'application/xml; charset=utf-8'
            };
        }

        // 最終執行SWCA計算並轉換為CSV
        const swcaCalc = new SwcaCalculateHandler(resultModels);
        resultModels = swcaCalc.calculateSwca();
        const csv = modelsToCsv(resultModels);
        
        return {
            result: csv,
            contentType: 'text/csv; charset=utf-8'
        };
    }

    /**
     * 處理JSON格式的請求
     */
    static async processJsonRequest(handlerType: string, data: any, options: any): Promise<{ result: string; contentType: string }> {
        let result: GnssModel[] | GnssModel | string = [];

        switch (handlerType) {
            case 'coordinateConvert':
                const { inputSys, outputSys, gnssModel } = options;
                const safeInputSys = inputSys || 'ecef';  // 預設值
                const safeOutputSys = outputSys || 'wgs84';  // 預設值
                const coordHandler = new CoordinateConvertHandler(safeInputSys, safeOutputSys);
                result = coordHandler.convert(gnssModel);
                break;
            case 'dataOutliers':
                const { windowSize: outliersWindowSize } = options;
                const outliersHandler = new DataOutliersHandler(data);
                result = outliersHandler.calculate(outliersWindowSize);
                break;
            case 'dataMedian':
                const { windowSize: medianWindowSize } = options;
                const medianHandler = new DataMedianHandler(data);
                result = medianHandler.calculate(medianWindowSize);
                break;
            case 'dataLowess':
                const { windowSize: lowessWindowSize } = options;
                const lowessHandler = new DataLowessHandler(data);
                result = lowessHandler.calculate(lowessWindowSize);
                break;
            case 'dataInterpolation':
                const interpolationHandler = new DataInterpolationHandler(data);
                result = interpolationHandler.interpolationData();
                break;
            case 'dataAverage':
                const averageHandler = new DataAverageHandler(data);
                result = averageHandler.calculate();
                break;
            case 'swcaCalculate':
                const swcaHandler = new SwcaCalculateHandler(data);
                const swca = swcaHandler.calculateSwca();
                const swcaXmlFormatter = new XmlFormatterHandler(swca);
                const xml = swcaXmlFormatter.formatToXml();
                return {
                    result: xml,
                    contentType: 'application/xml; charset=utf-8'
                };
            case 'formatXml':
                const formatter = new XmlFormatterHandler(data);
                result = formatter.formatToXml();
                return {
                    result: result as string,
                    contentType: 'application/xml'
                };
            default:
                throw new Error('Unknown handler type: ' + handlerType);
        }

        return {
            result: JSON.stringify(result),
            contentType: 'application/json'
        };
    }

    /**
     * 解析URL參數為ProcessingOptions
     */
    static parseProcessingOptions(url: URL): ProcessingOptions {
        const handlerTypeFromUrl = url.searchParams.get('handlerType');
        if (!handlerTypeFromUrl) {
            throw new Error('handlerType parameter is required');
        }

        const handlerTypes = handlerTypeFromUrl.split(',').map(h => h.trim()).filter(h => h);
        const options: ProcessingOptions = { handlerTypes };

        // 取得其他參數
        for (const [k, v] of url.searchParams.entries()) {
            if (k !== 'handlerType') {
                switch (k) {
                    case 'outlierSize':
                    case 'medianSize':  
                    case 'lowessSize':
                        options[k] = parseInt(v) || undefined;
                        break;
                    default:
                        options[k] = v;
                }
            }
        }

        return options;
    }
}