import { GnssModel } from './GnssModel.ts';
import { RandomNumberGenerator } from './RandomNumberGenerator.ts';
import { StatisticsCalculator, DataStats, ConservativeStats } from './StatisticsCalculator.ts';
import { 
    EnvironmentalFactorCalculator, 
    StationCharacteristics, 
    WeatherConditions 
} from './EnvironmentalFactorCalculator.ts';
import { StationCharacteristicsInferrer } from './StationCharacteristicsInferrer.ts';
import { TimestampManager } from './TimestampManager.ts';
import { DataCompatibilityAnalyzer, CompatibilityAnalysis } from './DataCompatibilityAnalyzer.ts';

/**
 * DataGeneratorFixed - 修正趨勢性問題的數據生成器
 * 主要修正：
 * 1. 改進隨機數生成策略，減少長期偏移
 * 2. 修正不規則變化邏輯，確保零均值
 * 3. 加強長期穩定性控制
 * 4. 改進與真實資料的銜接
 */
export class DataGenerator {
    // ============== 過渡控制參數 ==============
    // 用途：控制生成數據與真實數據之間的銜接平滑度
    private static readonly DEFAULT_TRANSITION_STEPS = 72;              // 預設過渡步數
    private static readonly MAX_TRANSITION_STEPS = 288;                 // 最大過渡步數
    private static readonly MIN_TRANSITION_STEPS = 36;                  // 最小過渡步數
    private static readonly TRANSITION_MULTIPLIER = 4;                  // 過渡步數倍數
    private static readonly LONG_GENERATION_THRESHOLD_HOURS = 12;       // 長時間生成閾值（小時）
    
    /**
     * TRANSITION_VARIATION_SCALE - 過渡變化尺度
     * 【調整指南】
     * - 增加此值 (0.05 → 0.10): 過渡期間變化更大，可能出現驟升驟降
     * - 減少此值 (0.05 → 0.02): 過渡更平滑，但可能過於緩慢
     * - 建議範圍: 0.01 - 0.15
     * - 當前值: 0.05 (中等平滑度)
     */
    private static readonly TRANSITION_VARIATION_SCALE = 0.01;
    
    // ============== 靜態GNSS解算震盪控制參數 ==============
    // 用途：控制靜態解算（固定站點）的數據變異程度
    
    /**
     * STATIC_OSCILLATION_ENHANCEMENT - 靜態解算振盪增強係數
     * 【震盪程度控制】
     * - 增加此值 (0.30 → 0.50): 資料震盪更明顯，變異性增加
     * - 減少此值 (0.30 → 0.15): 資料更穩定，震盪減少
     * - 建議範圍: 0.05 - 0.80
     * - 當前值: 0.30 (中等震盪)
     * 📊 影響程度: ★★★★☆ (主要震盪控制參數)
     */
    private static readonly STATIC_OSCILLATION_ENHANCEMENT = 3.60;
    
    /**
     * STATIC_BASIC_NOISE_FACTOR - 靜態解算基本噪聲係數
     * 【基礎變異控制】
     * - 增加此值 (0.15 → 0.30): 基礎噪聲增加，數據更不穩定
     * - 減少此值 (0.15 → 0.08): 基礎噪聲減少，數據更穩定
     * - 建議範圍: 0.05 - 0.50
     * - 當前值: 0.15 (低噪聲水平)
     * 📊 影響程度: ★★★☆☆ (持續性影響)
     */
    private static readonly STATIC_BASIC_NOISE_FACTOR = 1.80;
    
    /**
     * STATIC_EXTERNAL_NOISE_FACTOR - 靜態解算外部噪聲係數
     * 【突發變異控制】
     * - 增加此值 (0.30 → 0.60): 外部干擾增加，偶發性震盪增強
     * - 減少此值 (0.30 → 0.15): 外部干擾減少，震盪更平順
     * - 建議範圍: 0.10 - 1.00
     * - 當前值: 0.30 (中等外部噪聲)
     * 📊 影響程度: ★★☆☆☆ (間歇性影響)
     */
    private static readonly STATIC_EXTERNAL_NOISE_FACTOR = 3.60;

    // ============== 動態GNSS解算震盪控制參數 ==============
    // 用途：控制動態解算（移動設備）的數據變異程度
    
    /**
     * OSCILLATION_ENHANCEMENT - 動態解算振盪增強係數
     * 【動態震盪控制】
     * - 增加此值 (0.50 → 0.80): 動態解算震盪更明顯
     * - 減少此值 (0.50 → 0.30): 動態解算更平穩
     * - 建議範圍: 0.20 - 1.20
     * - 當前值: 0.50 (標準動態震盪)
     * 📊 影響程度: ★★★★☆ (動態模式主控參數)
     */
    private static readonly OSCILLATION_ENHANCEMENT = 1.60;
    
    /**
     * BASIC_NOISE_FACTOR - 動態解算基本噪聲係數
     * 【動態基礎變異】
     * - 增加此值 (0.60 → 1.00): 動態基礎噪聲增加
     * - 減少此值 (0.60 → 0.30): 動態基礎噪聲減少
     * - 建議範圍: 0.20 - 1.50
     * - 當前值: 0.60 (標準動態噪聲)
     * 📊 影響程度: ★★★☆☆
     */
    private static readonly BASIC_NOISE_FACTOR = 1.20;
    
    /**
     * EXTERNAL_NOISE_FACTOR - 動態解算外部噪聲係數
     * 【動態突發變異】
     * - 增加此值 (1.20 → 2.00): 動態外部干擾增強
     * - 減少此值 (1.20 → 0.60): 動態外部干擾減少
     * - 建議範圍: 0.40 - 3.00
     * - 當前值: 1.20 (標準動態外部噪聲)
     * 📊 影響程度: ★★☆☆☆
     */
    private static readonly EXTERNAL_NOISE_FACTOR = 2.00;

    // ============== 長期趨勢控制參數 ==============
    // 用途：防止長時間生成時出現不自然的趨勢漂移
    
    /**
     * TREND_DAMPING_FACTOR - 趨勢阻尼係數
     * 【長期穩定性控制】
     * - 增加此值 (0.95 → 0.98): 趨勢衰減更慢，允許更大的長期變化
     * - 減少此值 (0.95 → 0.90): 趨勢衰減更快，強制回歸基準值
     * - 建議範圍: 0.85 - 0.99
     * - 當前值: 0.95 (中等阻尼)
     * 📊 影響程度: ★★★★★ (長期穩定性關鍵參數)
     */
    private static readonly TREND_DAMPING_FACTOR = 0.50;
    
    /**
     * DRIFT_CORRECTION_THRESHOLD - 漂移修正閾值 (單位: 米)
     * 【漂移控制靈敏度】
     * - 增加此值 (0.02 → 0.05): 容忍更大的漂移，震盪幅度可能增加
     * - 減少此值 (0.02 → 0.01): 更敏感的漂移控制，震盪幅度受限
     * - 建議範圍: 0.005 - 0.10
     * - 當前值: 0.02 (2cm 漂移閾值)
     * 📊 影響程度: ★★★★☆ (漂移控制關鍵)
     */
    private static readonly DRIFT_CORRECTION_THRESHOLD = 0.0080;
    
    /**
     * DRIFT_CORRECTION_STRENGTH - 漂移修正強度
     * 【修正力度控制】
     * - 增加此值 (0.1 → 0.3): 漂移修正更積極，震盪被更快抑制
     * - 減少此值 (0.1 → 0.05): 漂移修正更溫和，允許更自然的變化
     * - 建議範圍: 0.01 - 0.50
     * - 當前值: 0.1 (溫和修正)
     * 📊 影響程度: ★★★☆☆
     */
    private static readonly DRIFT_CORRECTION_STRENGTH = 0.3;

    // 專門組件
    private randomGenerator: RandomNumberGenerator;
    private statisticsCalculator: StatisticsCalculator;
    private environmentalCalculator: EnvironmentalFactorCalculator;
    private stationInferrer: StationCharacteristicsInferrer;
    private timestampManager: TimestampManager;
    private compatibilityAnalyzer: DataCompatibilityAnalyzer;

    // 新增：趨勢追蹤
    private cumulativeDriftE: number = 0;
    private cumulativeDriftN: number = 0;
    private cumulativeDriftH: number = 0;

    constructor() {
        this.randomGenerator = new RandomNumberGenerator(42);
        this.statisticsCalculator = new StatisticsCalculator();
        this.environmentalCalculator = new EnvironmentalFactorCalculator();
        this.stationInferrer = new StationCharacteristicsInferrer();
        this.timestampManager = new TimestampManager();
        this.compatibilityAnalyzer = new DataCompatibilityAnalyzer();
    }

    /**
     * 🎛️ 快速參數配置方法
     * 根據需求快速調整震盪程度
     * 
     * @param preset 預設配置
     * - 'low-oscillation': 低震盪，適合需要穩定數據的場景
     * - 'medium-oscillation': 中等震盪，平衡穩定性和自然性
     * - 'high-oscillation': 高震盪，適合需要更多變異的場景
     * - 'natural': 模擬真實 GNSS 特性
     */
    public static getParameterConfiguration(preset: 'low-oscillation' | 'medium-oscillation' | 'high-oscillation' | 'natural') {
        const configs = {
            'low-oscillation': {
                description: '低震盪配置 - 數據更穩定，適合高精度要求',
                parameters: {
                    STATIC_OSCILLATION_ENHANCEMENT: 0.15,
                    STATIC_BASIC_NOISE_FACTOR: 0.08,
                    STATIC_EXTERNAL_NOISE_FACTOR: 0.15,
                    jumpFrequency: 0.02,
                    jumpMagnitude: { static: 0.8, kinematic: 1.2 },
                    burstFrequency: 0.01,
                    burstIntensity: 1.0
                }
            },
            'medium-oscillation': {
                description: '中等震盪配置 - 平衡穩定性和自然變異（當前設定）',
                parameters: {
                    STATIC_OSCILLATION_ENHANCEMENT: 0.30,
                    STATIC_BASIC_NOISE_FACTOR: 0.15,
                    STATIC_EXTERNAL_NOISE_FACTOR: 0.30,
                    jumpFrequency: 0.06,
                    jumpMagnitude: { static: 1.2, kinematic: 2.0 },
                    burstFrequency: 0.02,
                    burstIntensity: 1.2
                }
            },
            'high-oscillation': {
                description: '高震盪配置 - 更多自然變異，適合模擬複雜環境',
                parameters: {
                    STATIC_OSCILLATION_ENHANCEMENT: 0.50,
                    STATIC_BASIC_NOISE_FACTOR: 0.25,
                    STATIC_EXTERNAL_NOISE_FACTOR: 0.50,
                    jumpFrequency: 0.12,
                    jumpMagnitude: { static: 1.8, kinematic: 2.8 },
                    burstFrequency: 0.05,
                    burstIntensity: 1.8
                }
            },
            'natural': {
                description: '自然配置 - 最接近真實 GNSS 行為',
                parameters: {
                    STATIC_OSCILLATION_ENHANCEMENT: 0.35,
                    STATIC_BASIC_NOISE_FACTOR: 0.20,
                    STATIC_EXTERNAL_NOISE_FACTOR: 0.40,
                    jumpFrequency: 0.08,
                    jumpMagnitude: { static: 1.5, kinematic: 2.3 },
                    burstFrequency: 0.03,
                    burstIntensity: 1.5
                }
            }
        };
        
        return configs[preset];
    }

    /**
     * 修正版隨機數據生成
     */
    public generateRandomData(
        samples: GnssModel[], 
        count: number, 
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        if (samples.length === 0) return [];
        
        // 重置累積漂移追蹤
        this.cumulativeDriftE = 0;
        this.cumulativeDriftN = 0;
        this.cumulativeDriftH = 0;
        
        const stats = this.statisticsCalculator.analyzeDataStats(samples);
        const inferredCharacteristics = stationCharacteristics || 
            this.stationInferrer.inferStationCharacteristics(samples, stats);
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        const defaultWeather = weatherConditions || 
            this.environmentalCalculator.getDefaultWeatherConditions();
        
        // 使用改進的種子策略，減少偏移
        const baseSeed = 42;
        this.randomGenerator.resetSeed(baseSeed);
        const result: GnssModel[] = [];
        
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(inferredCharacteristics);
        
        const oscillationFactor = solutionType === 'static' 
            ? DataGenerator.STATIC_OSCILLATION_ENHANCEMENT 
            : DataGenerator.OSCILLATION_ENHANCEMENT;
            
        const adjustedStats = this.adjustStatsForEnvironment(stats, oscillationFactor, envNoiseFactor);
        
        const isLongGap = count > 12;
        
        // 生成改進的長期趨勢
        const trendE = this.generateStabilizedLongTermTrend(count, adjustedStats.eStdDev, isLongGap);
        const trendN = this.generateStabilizedLongTermTrend(count, adjustedStats.nStdDev, isLongGap);
        const trendH = this.generateStabilizedLongTermTrend(count, adjustedStats.hStdDev, isLongGap);
        
        // 生成數據點
        for (let i = 0; i < count; i++) {
            const baseIndex = this.selectDiverseBaseIndex(samples.length, i, count);
            const baseSample = samples[baseIndex];
            
            const newModel = this.generateStabilizedDataPoint(
                i, count, baseSample, trendE[i], trendN[i], trendH[i],
                adjustedStats, inferredCharacteristics, defaultWeather, 
                isLongGap, solutionType, samples
            );
            
            result.push(newModel);
        }
        
        return this.timestampManager.assignSequentialTimestamps(
            result, 
            this.timestampManager.getStartTimestamp(samples)
        );
    }

    /**
     * 修正版過渡數據生成
     */
    public generateTransitionData(
        generatedData: GnssModel[],
        targetRealData: GnssModel[],
        transitionSteps: number = DataGenerator.DEFAULT_TRANSITION_STEPS
    ): GnssModel[] {
        if (generatedData.length === 0 || targetRealData.length === 0) return [];
        
        const lastGenerated = generatedData[generatedData.length - 1];
        const firstReal = targetRealData[0];
        const transitionResult: GnssModel[] = [];
        
        const deltaE = firstReal.E - lastGenerated.E;
        const deltaN = firstReal.N - lastGenerated.N;
        const deltaH = firstReal.H - lastGenerated.H;
        
        // 使用更平滑的過渡算法
        for (let i = 1; i <= transitionSteps; i++) {
            const progress = i / (transitionSteps + 1);
            const smoothProgress = this.improvedTransitionCurve(progress);
            
            // 減少隨機變化以確保平滑過渡
            const variationScale = Math.min(0.0005, Math.max(Math.abs(deltaE), Math.abs(deltaN), Math.abs(deltaH)) * DataGenerator.TRANSITION_VARIATION_SCALE);
            const randomVariationE = (this.randomGenerator.next() - 0.5) * variationScale;
            const randomVariationN = (this.randomGenerator.next() - 0.5) * variationScale;
            const randomVariationH = (this.randomGenerator.next() - 0.5) * variationScale * 1.2;
            
            const transitionPoint: GnssModel = {
                dateTime: this.timestampManager.interpolateTimestamp(lastGenerated.dateTime, firstReal.dateTime, progress),
                E: lastGenerated.E + deltaE * smoothProgress + randomVariationE,
                N: lastGenerated.N + deltaN * smoothProgress + randomVariationN, 
                H: lastGenerated.H + deltaH * smoothProgress + randomVariationH,
                latitude: this.timestampManager.interpolateValue(lastGenerated.latitude || 0, firstReal.latitude || 0, smoothProgress),
                longitude: this.timestampManager.interpolateValue(lastGenerated.longitude || 0, firstReal.longitude || 0, smoothProgress),
                height: this.timestampManager.interpolateValue(lastGenerated.height || 0, firstReal.height || 0, smoothProgress),
                angle: this.timestampManager.interpolateValue(lastGenerated.angle || 0, firstReal.angle || 0, smoothProgress),
                axis: this.timestampManager.interpolateValue(lastGenerated.axis || 0, firstReal.axis || 0, smoothProgress),
                plate: this.timestampManager.interpolateValue(lastGenerated.plate || 0, firstReal.plate || 0, smoothProgress),
                moveE: this.timestampManager.interpolateValue(lastGenerated.moveE || 0, firstReal.moveE || 0, smoothProgress),
                moveN: this.timestampManager.interpolateValue(lastGenerated.moveN || 0, firstReal.moveN || 0, smoothProgress),
                moveH: this.timestampManager.interpolateValue(lastGenerated.moveH || 0, firstReal.moveH || 0, smoothProgress),
                moveTotal: 0,
                dayE: this.timestampManager.interpolateValue(lastGenerated.dayE || 0, firstReal.dayE || 0, smoothProgress),
                dayN: this.timestampManager.interpolateValue(lastGenerated.dayN || 0, firstReal.dayN || 0, smoothProgress),
                dayH: this.timestampManager.interpolateValue(lastGenerated.dayH || 0, firstReal.dayH || 0, smoothProgress)
            };
            
            transitionPoint.moveTotal = this.timestampManager.calculateMoveTotal(transitionPoint);
            transitionResult.push(transitionPoint);
        }
        
        return transitionResult;
    }

    /**
     * 修正版無縫數據生成
     */
    public generateSeamlessData(
        samples: GnssModel[], 
        count: number,
        nextRealData?: GnssModel[],
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        const mainData = this.generateRandomData(samples, count, stationCharacteristics, weatherConditions);
        
        if (!nextRealData || nextRealData.length === 0) {
            return mainData;
        }
        
        const lastGenerated = mainData[mainData.length - 1];
        const firstReal = nextRealData[0];
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        
        const discontinuityThreshold = this.statisticsCalculator.calculateDiscontinuityThreshold(samples, solutionType);
        
        const deltaE = Math.abs(firstReal.E - lastGenerated.E);
        const deltaN = Math.abs(firstReal.N - lastGenerated.N);
        const deltaH = Math.abs(firstReal.H - lastGenerated.H);
        const maxDelta = Math.max(deltaE, deltaN, deltaH);
        
        // 使用更嚴格的閾值來決定是否需要過渡
        const adjustedThreshold = discontinuityThreshold * 0.2; // 更早觸發過渡
        
        if (maxDelta > adjustedThreshold) {
            const generationDurationHours = mainData.length / 6;
            let adaptiveTransitionSteps = this.compatibilityAnalyzer.calculateAdaptiveTransitionSteps(
                maxDelta, discontinuityThreshold, generationDurationHours,
                DataGenerator.MIN_TRANSITION_STEPS, DataGenerator.MAX_TRANSITION_STEPS,
                DataGenerator.TRANSITION_MULTIPLIER, DataGenerator.LONG_GENERATION_THRESHOLD_HOURS
            );
            
            // 對於大的落差，增加過渡步數
            if (maxDelta > discontinuityThreshold * 2) {
                adaptiveTransitionSteps = Math.min(adaptiveTransitionSteps * 1.5, DataGenerator.MAX_TRANSITION_STEPS);
            }
            
            const transitionData = this.generateTransitionData(mainData, nextRealData, Math.floor(adaptiveTransitionSteps));
            return [...mainData, ...transitionData];
        }
        
        return mainData;
    }

    /**
     * 修正版保守擴展
     */
    public generateConservativeExtension(
        samples: GnssModel[], 
        count: number, 
        lastKnownPoint: GnssModel,
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        if (samples.length === 0 || count <= 0) return [];
        
        // 計算歷史數據中位數作為穩定的參考中心點
        const medianReference = this.statisticsCalculator.calculateMedianReference(samples);
        
        // 重置累積漂移追蹤，基於中位數參考點
        this.cumulativeDriftE = 0;
        this.cumulativeDriftN = 0;
        this.cumulativeDriftH = 0;
        
        const stats = this.statisticsCalculator.analyzeDataStats(samples);
        const inferredCharacteristics = stationCharacteristics || 
            this.stationInferrer.inferStationCharacteristics(samples, stats);
        const inferredWeather = weatherConditions || 
            this.environmentalCalculator.getDefaultWeatherConditions();
        
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        
        this.randomGenerator.resetSeed(42 + 999);
        const result: GnssModel[] = [];
        
        const conservativeStats = this.statisticsCalculator.analyzeConservativeStats(samples);
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(inferredCharacteristics);
        
        // 使用更保守的振盪因子
        const extensionOscillationFactor = solutionType === 'static'
            ? DataGenerator.STATIC_OSCILLATION_ENHANCEMENT * 0.8 * envNoiseFactor
            : DataGenerator.OSCILLATION_ENHANCEMENT * 0.5 * envNoiseFactor;
            
        const adjustedStats = {
            eVariance: conservativeStats.eVariance * extensionOscillationFactor,
            nVariance: conservativeStats.nVariance * extensionOscillationFactor,
            hVariance: conservativeStats.hVariance * extensionOscillationFactor
        };
        
        // 對靜態解算應用更嚴格的約束
        if (solutionType === 'static') {
            adjustedStats.eVariance = Math.min(adjustedStats.eVariance, 0.01);
            adjustedStats.nVariance = Math.min(adjustedStats.nVariance, 0.01);
            adjustedStats.hVariance = Math.min(adjustedStats.hVariance, 0.02);
        }
        
        const isLongExtension = count > 432;
        
        for (let i = 0; i < count; i++) {
            const newModel = this.generateConservativeDataPointWithControl(
                i, count, medianReference, adjustedStats, 
                inferredCharacteristics, inferredWeather, isLongExtension, lastKnownPoint
            );
            
            result.push(newModel);
        }
        
        return this.timestampManager.assignSequentialTimestamps(
            result, 
            this.timestampManager.getExtensionStartTimestamp(lastKnownPoint)
        );
    }

    public analyzeDataCompatibility(generatedData: GnssModel[], realData: GnssModel[]): CompatibilityAnalysis {
        return this.compatibilityAnalyzer.analyzeDataCompatibility(generatedData, realData);
    }

    // ==================== 修正的私有方法 ====================
    
    /**
     * 生成穩定化的長期趨勢
     */
    private generateStabilizedLongTermTrend(count: number, stdDev: number, isLongGap: boolean): number[] {
        const trend: number[] = [];
        
        if (!isLongGap) {
            // 短期：使用零均值噪聲
            for (let i = 0; i < count; i++) {
                trend.push(this.generateZeroMeanNoise() * stdDev * 0.15);
            }
            return trend;
        }
        
        // 長期：使用穩定化算法
        const basePattern: number[] = [];
        const periodicComponent: number[] = [];
        
        const trendMagnitude = stdDev * 0.5; // 降低趨勢幅度
        let currentTrend = (this.randomGenerator.next() - 0.5) * trendMagnitude;
        let trendChange = (this.randomGenerator.next() - 0.5) * trendMagnitude * 0.05; // 降低變化率
        
        for (let i = 0; i < count; i++) {
            basePattern.push(currentTrend);
            
            // 應用趨勢阻尼
            currentTrend *= DataGenerator.TREND_DAMPING_FACTOR;
            currentTrend += trendChange;
            
            // 更少的趨勢變化
            if (this.randomGenerator.next() < 0.05) { // 降低變化頻率
                trendChange = (this.randomGenerator.next() - 0.5) * trendMagnitude * 0.05;
            }
        }
        
        // 週期性分量使用更穩定的參數
        const period = 24 + this.generateZeroMeanNoise() * 4; // 降低週期變化
        const amplitude = stdDev * 0.2; // 降低振幅
        const phaseShift = this.randomGenerator.next() * 2 * Math.PI;
        
        for (let i = 0; i < count; i++) {
            periodicComponent.push(amplitude * Math.sin(2 * Math.PI * i / period + phaseShift));
            trend.push(basePattern[i] + periodicComponent[i]);
        }
        
        return trend;
    }

    /**
     * 生成零均值噪聲
     */
    private generateZeroMeanNoise(): number {
        // 使用Box-Muller變換確保零均值
        return this.randomGenerator.gaussianRandom();
    }

    /**
     * 生成穩定化的數據點
     */
    private generateStabilizedDataPoint(
        index: number,
        totalCount: number,
        baseSample: GnssModel,
        trendE: number,
        trendN: number,
        trendH: number,
        stats: DataStats,
        characteristics: StationCharacteristics,
        weather: WeatherConditions,
        isLongGap: boolean,
        solutionType: 'static' | 'kinematic',
        samples: GnssModel[]
    ): GnssModel {
        const newModel: GnssModel = {
            dateTime: '',
            E: 0, N: 0, H: 0,
            latitude: baseSample.latitude || 0,
            longitude: baseSample.longitude || 0,
            height: baseSample.height || 0,
            angle: 0, axis: 0, plate: 0,
            moveE: 0, moveN: 0, moveH: 0, moveTotal: 0,
            dayE: 0, dayN: 0, dayH: 0
        };

        const startTime = this.timestampManager.getStartTimestamp(samples);
        const currentTime = new Date(startTime.getTime() + index * 10 * 60 * 1000);
        const timeOfDay = currentTime.getHours() + currentTime.getMinutes() / 60;
        const seasonalFactor = this.environmentalCalculator.calculateSeasonalFactor(currentTime);

        const satGeometry = this.environmentalCalculator.simulateSatelliteGeometry(currentTime, characteristics?.location);
        const geometryFactor = Math.sqrt(satGeometry.pdop / 2.5); // 降低幾何影響

        // 使用改進的噪聲生成
        let timeBasedNoiseE = this.generateStabilizedTimeBasedNoise(index, totalCount, stats.eStdDev, solutionType);
        let timeBasedNoiseN = this.generateStabilizedTimeBasedNoise(index, totalCount, stats.nStdDev, solutionType);
        let timeBasedNoiseH = this.generateStabilizedTimeBasedNoise(index, totalCount, stats.hStdDev, solutionType);

        const timeVaryingEnvFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics, timeOfDay) * 0.8; // 降低環境影響
        timeBasedNoiseE = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseE * timeVaryingEnvFactor, weather);
        timeBasedNoiseN = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseN * timeVaryingEnvFactor, weather);
        timeBasedNoiseH = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseH * timeVaryingEnvFactor, weather);

        timeBasedNoiseE *= seasonalFactor * geometryFactor;
        timeBasedNoiseN *= seasonalFactor * geometryFactor;
        timeBasedNoiseH *= seasonalFactor * geometryFactor * 1.1;

        // 計算新位置
        const newE = baseSample.E + trendE + timeBasedNoiseE;
        const newN = baseSample.N + trendN + timeBasedNoiseN;
        const newH = baseSample.H + trendH + timeBasedNoiseH;

        // 應用漂移修正
        const correctedPosition = this.applyDriftCorrection(newE, newN, newH, baseSample);
        newModel.E = correctedPosition.E;
        newModel.N = correctedPosition.N;
        newModel.H = correctedPosition.H;

        // 其他欄位使用更穩定的變化
        const angleVariation = this.generateStabilizedVariation(index, totalCount, 0.05, isLongGap);
        const axisVariation = this.generateStabilizedVariation(index, totalCount, 0.03, isLongGap);
        const plateVariation = this.generateStabilizedVariation(index, totalCount, 0.03, isLongGap);

        newModel.angle = (baseSample.angle || 0) + angleVariation;
        newModel.axis = (baseSample.axis || 0) + axisVariation;
        newModel.plate = (baseSample.plate || 0) + plateVariation;

        newModel.moveE = (baseSample.moveE || 0) + this.generateStabilizedVariation(index, totalCount, stats.eStdDev * 0.1, isLongGap);
        newModel.moveN = (baseSample.moveN || 0) + this.generateStabilizedVariation(index, totalCount, stats.nStdDev * 0.1, isLongGap);
        newModel.moveH = (baseSample.moveH || 0) + this.generateStabilizedVariation(index, totalCount, stats.hStdDev * 0.1, isLongGap);
        newModel.moveTotal = this.timestampManager.calculateMoveTotal(newModel);

        newModel.dayE = (baseSample.dayE || 0) + this.generateStabilizedVariation(index, totalCount, stats.eStdDev * 0.2, isLongGap);
        newModel.dayN = (baseSample.dayN || 0) + this.generateStabilizedVariation(index, totalCount, stats.nStdDev * 0.2, isLongGap);
        newModel.dayH = (baseSample.dayH || 0) + this.generateStabilizedVariation(index, totalCount, stats.hStdDev * 0.2, isLongGap);

        return newModel;
    }

    /**
     * 應用漂移修正
     */
    private applyDriftCorrection(
        newE: number, 
        newN: number, 
        newH: number, 
        referencePoint: GnssModel | { E: number; N: number; H: number }
    ): { E: number; N: number; H: number } {
        // 更新累積漂移，基於參考點計算
        this.cumulativeDriftE = newE - referencePoint.E;
        this.cumulativeDriftN = newN - referencePoint.N;
        this.cumulativeDriftH = newH - referencePoint.H;

        // 檢查是否需要修正
        const threshold = DataGenerator.DRIFT_CORRECTION_THRESHOLD;
        const strength = DataGenerator.DRIFT_CORRECTION_STRENGTH;

        let correctedE = newE;
        let correctedN = newN;
        let correctedH = newH;

        if (Math.abs(this.cumulativeDriftE) > threshold) {
            const correction = -this.cumulativeDriftE * strength;
            correctedE += correction;
            this.cumulativeDriftE += correction;
        }

        if (Math.abs(this.cumulativeDriftN) > threshold) {
            const correction = -this.cumulativeDriftN * strength;
            correctedN += correction;
            this.cumulativeDriftN += correction;
        }

        if (Math.abs(this.cumulativeDriftH) > threshold) {
            const correction = -this.cumulativeDriftH * strength;
            correctedH += correction;
            this.cumulativeDriftH += correction;
        }

        return { E: correctedE, N: correctedN, H: correctedH };
    }

    /**
     * 生成穩定化的時間相關噪聲
     */
    private generateStabilizedTimeBasedNoise(index: number, totalCount: number, stdDev: number, solutionType: 'static' | 'kinematic'): number {
        const basicNoiseFactor = solutionType === 'static' 
            ? DataGenerator.STATIC_BASIC_NOISE_FACTOR 
            : DataGenerator.BASIC_NOISE_FACTOR;
            
        const externalNoiseFactor = solutionType === 'static'
            ? DataGenerator.STATIC_EXTERNAL_NOISE_FACTOR
            : DataGenerator.EXTERNAL_NOISE_FACTOR;
        
        // 使用改進的不規則變化生成
        let baseNoise = this.generateStabilizedIrregularVariation(stdDev * stdDev, index, totalCount, solutionType) * basicNoiseFactor;
        
        const timeProgress = index / totalCount;
        
        // 減少時間調製的不規則性
        const timeFactor = 1.0 + 
            0.2 * Math.sin(2 * Math.PI * timeProgress * 2) +
            0.1 * Math.sin(2 * Math.PI * timeProgress * 0.5) +
            0.05 * this.generateZeroMeanNoise();
        
        const externalNoiseProb = solutionType === 'static' ? 0.02 : 0.04; // 降低外部噪聲頻率
        
        if (this.randomGenerator.next() < externalNoiseProb) {
            const burstNoise = this.generateStabilizedIrregularVariation(stdDev * stdDev, index, totalCount, solutionType) * externalNoiseFactor * 0.5; // 降低突發噪聲
            baseNoise += burstNoise;
        }
        
        const conservativeTimeFactor = solutionType === 'static' ? timeFactor * 0.6 : timeFactor * 0.8;
        
        return baseNoise * conservativeTimeFactor;
    }

    /**
     * 生成穩定化的不規則變化
     * 🎯 這是控制數據震盪程度的核心函數
     * 
     * 【內部震盪控制參數說明】
     */
    private generateStabilizedIrregularVariation(baseVariance: number, index: number, totalCount: number, solutionType: 'static' | 'kinematic'): number {
        // 基本隨機分量確保零均值
        let variation = this.generateZeroMeanNoise() * Math.sqrt(baseVariance);
        
        /**
         * 🔹 突然跳躍控制參數
         * - 頻率控制: 0.06 (6% 機率發生跳躍)
         *   調整指南: 增加 → 更多突發性震盪 | 減少 → 更平穩
         * - 幅度控制: static=1.2, kinematic=2.0
         *   調整指南: 增加 → 跳躍更明顯 | 減少 → 跳躍更溫和
         */
        if (this.randomGenerator.next() < 0.06) { // 🎛️ 跳躍頻率 [建議範圍: 0.01-0.15]
            const jumpMagnitude = solutionType === 'static' ? 1.2 : 2.0; // 🎛️ 跳躍幅度 [建議範圍: 0.5-3.0]
            variation += (this.randomGenerator.next() - 0.5) * Math.sqrt(baseVariance) * jumpMagnitude;
        }
        
        /**
         * 🔹 聚集效應控制參數
         * - 觸發閾值: 0.7 (高) / 0.3 (低)
         *   調整指南: 降低閾值 → 更容易觸發聚集效應
         * - 聚集強度: 1.3+0.4 (放大) / 0.5+0.3 (縮小)
         *   調整指南: 增加係數 → 聚集效應更明顯
         */
        const clusterPhase = Math.sin(2 * Math.PI * index / (12 + this.randomGenerator.next() * 8));
        if (Math.abs(clusterPhase) > 0.7) { // 🎛️ 高聚集閾值 [建議範圍: 0.5-0.9]
            variation *= 1.3 + this.randomGenerator.next() * 0.4; // 🎛️ 聚集放大 [建議範圍: 1.1-2.0]
        } else if (Math.abs(clusterPhase) < 0.3) { // 🎛️ 低聚集閾值 [建議範圍: 0.1-0.5]
            variation *= 0.5 + this.randomGenerator.next() * 0.3; // 🎛️ 聚集縮小 [建議範圍: 0.2-0.8]
        }
        
        /**
         * 🔹 隨機爆發控制參數
         * - 爆發頻率: 0.02 (2% 機率)
         *   調整指南: 增加 → 更多隨機爆發震盪
         * - 爆發強度: 1.2+1.0
         *   調整指南: 增加 → 爆發更劇烈
         */
        if (this.randomGenerator.next() < 0.08) { // 🎛️ 爆發頻率 [建議範圍: 0.005-0.08]
            const burstIntensity = 1.2 + this.randomGenerator.next() * 3.0; // 🎛️ 爆發強度 [建議範圍: 1.0-3.0]
            variation *= burstIntensity;
        }
        
        /**
         * 🔹 時間相關性中斷控制
         * - 中斷頻率: 0.04 (4% 機率)
         * - 中斷強度: 2倍變化
         *   調整指南: 增加參數 → 更多時間不連續性
         */
        if (this.randomGenerator.next() < 0.16) { // 🎛️ 中斷頻率 [建議範圍: 0.01-0.10]
            variation *= (this.randomGenerator.next() - 0.5) * 4; // 🎛️ 中斷強度 [建議範圍: 1.0-4.0]
        }
        
        /**
         * 🔹 多頻率分量控制參數
         * - 高頻分量 (週期=4): 0.1 振幅，模擬短期震盪
         * - 中頻分量 (週期=20): 0.2 振幅，模擬中期週期
         * - 低頻分量 (週期=60): 0.15 振幅，模擬長期週期
         * - 總影響力: 0.3
         *   調整指南: 增加振幅/影響力 → 更多週期性震盪
         */
        const highFreq = Math.sin(2 * Math.PI * index / 4) * 0.3;     // 🎛️ 高頻振幅 [建議範圍: 0.05-0.3]
        const midFreq = Math.sin(2 * Math.PI * index / 20) * 0.5;     // 🎛️ 中頻振幅 [建議範圍: 0.1-0.5]
        const lowFreq = Math.sin(2 * Math.PI * index / 60) * 0.4;    // 🎛️ 低頻振幅 [建議範圍: 0.05-0.4]
        
        const frequencyComponent = (highFreq + midFreq + lowFreq) * Math.sqrt(baseVariance) * 0.8; // 🎛️ 總頻率影響 [建議範圍: 0.1-0.8]
        
        /**
         * 🔹 穩定化權重控制
         * - 基礎權重: 0.8，隨機範圍: 0.3
         * - 實際權重範圍: 0.8-1.1
         *   調整指南: 增加基礎/範圍 → 更大的總體變異
         */
        const stabilizedWeight = 0.8 + this.randomGenerator.next() * 0.3; // 🎛️ 穩定權重 [基礎: 0.5-1.2, 範圍: 0.1-0.6]
        
        return (variation + frequencyComponent) * stabilizedWeight;
    }

    /**
     * 生成穩定化的變化
     */
    private generateStabilizedVariation(index: number, totalCount: number, baseRange: number, isLongGap: boolean): number {
        let variation = this.generateStabilizedIrregularVariation(baseRange * baseRange, index, totalCount, 'static') * 0.6; // 降低幅度
        
        if (isLongGap) {
            const phaseVariation = Math.sin(Math.PI * index / totalCount * (1.5 + this.randomGenerator.next() * 0.5)); // 降低週期變化
            const enhancementFactor = 1.1 + 0.4 * Math.abs(phaseVariation); // 降低增強因子
            variation *= enhancementFactor;
            
            // 降低突發事件
            if (this.randomGenerator.next() < 0.08) { // 降低頻率
                const burstFactor = 1.5 + this.randomGenerator.next() * 1.5; // 降低強度
                variation *= burstFactor;
            }
            
            if (this.randomGenerator.next() < 0.05) {
                variation *= 0.3 + this.randomGenerator.next() * 0.2;
            }
        }
        
        return variation;
    }

    /**
     * 生成受控的保守數據點
     */
    private generateConservativeDataPointWithControl(
        index: number,
        totalCount: number,
        referencePoint: { E: number; N: number; H: number },
        stats: ConservativeStats,
        characteristics: StationCharacteristics,
        weather: WeatherConditions,
        isLongExtension: boolean,
        lastKnownPoint: GnssModel
    ): GnssModel {
        const newModel: GnssModel = {
            dateTime: '',
            E: 0, N: 0, H: 0,
            latitude: lastKnownPoint.latitude || 0,
            longitude: lastKnownPoint.longitude || 0,
            height: lastKnownPoint.height || 0,
            angle: 0, axis: 0, plate: 0,
            moveE: 0, moveN: 0, moveH: 0, moveTotal: 0,
            dayE: 0, dayN: 0, dayH: 0
        };

        const currentTime = new Date(this.timestampManager.getExtensionStartTimestamp(lastKnownPoint).getTime() + index * 10 * 60 * 1000);
        const timeOfDay = currentTime.getHours() + currentTime.getMinutes() / 60;
        const seasonalFactor = this.environmentalCalculator.calculateSeasonalFactor(currentTime);

        const satGeometry = this.environmentalCalculator.simulateSatelliteGeometry(currentTime, characteristics?.location);
        const conservativeGeometryFactor = Math.sqrt(satGeometry.pdop / 4.0); // 更保守

        const baseStabilityFactor = this.calculateEnhancedStabilityFactor(index, totalCount, isLongExtension);
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics);
        const envStabilityFactor = baseStabilityFactor / Math.max(1.0, envNoiseFactor * 0.3);

        // 使用改進的隨機游走
        const eChange = this.generateControlledRandomWalk(stats.eVariance, envStabilityFactor, index, totalCount);
        const nChange = this.generateControlledRandomWalk(stats.nVariance, envStabilityFactor, index, totalCount);
        const hChange = this.generateControlledRandomWalk(stats.hVariance, envStabilityFactor, index, totalCount);

        const timeVaryingEnvFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics, timeOfDay) * 0.3; // 大幅降低
        const adjustedEChange = this.environmentalCalculator.applyWeatherEffects(eChange * timeVaryingEnvFactor, weather);
        const adjustedNChange = this.environmentalCalculator.applyWeatherEffects(nChange * timeVaryingEnvFactor, weather);
        const adjustedHChange = this.environmentalCalculator.applyWeatherEffects(hChange * timeVaryingEnvFactor, weather);

        // 計算新位置並應用漂移控制，使用中位數參考點作為中心
        const newE = referencePoint.E + this.cumulativeDriftE + adjustedEChange * seasonalFactor * conservativeGeometryFactor;
        const newN = referencePoint.N + this.cumulativeDriftN + adjustedNChange * seasonalFactor * conservativeGeometryFactor;
        const newH = referencePoint.H + this.cumulativeDriftH + adjustedHChange * seasonalFactor * conservativeGeometryFactor * 1.1;

        const correctedPosition = this.applyDriftCorrection(newE, newN, newH, referencePoint);
        newModel.E = correctedPosition.E;
        newModel.N = correctedPosition.N;
        newModel.H = correctedPosition.H;

        newModel.angle = (lastKnownPoint.angle || 0) + this.generateConservativeTinyVariation(0.3, envStabilityFactor);
        newModel.axis = (lastKnownPoint.axis || 0) + this.generateConservativeTinyVariation(0.05, envStabilityFactor);
        newModel.plate = (lastKnownPoint.plate || 0) + this.generateConservativeTinyVariation(0.05, envStabilityFactor);

        newModel.moveE = this.generateConservativeTinyVariation(stats.eVariance * 0.3, envStabilityFactor);
        newModel.moveN = this.generateConservativeTinyVariation(stats.nVariance * 0.3, envStabilityFactor);
        newModel.moveH = this.generateConservativeTinyVariation(stats.hVariance * 0.3, envStabilityFactor);
        newModel.moveTotal = this.timestampManager.calculateMoveTotal(newModel);

        newModel.dayE = (lastKnownPoint.dayE || 0) + this.generateConservativeTinyVariation(stats.eVariance * 0.2, envStabilityFactor);
        newModel.dayN = (lastKnownPoint.dayN || 0) + this.generateConservativeTinyVariation(stats.nVariance * 0.2, envStabilityFactor);
        newModel.dayH = (lastKnownPoint.dayH || 0) + this.generateConservativeTinyVariation(stats.hVariance * 0.2, envStabilityFactor);

        return newModel;
    }

    /**
     * 生成受控的隨機游走
     */
    private generateControlledRandomWalk(variance: number, stabilityFactor: number, index: number, totalCount: number): number {
        const irregularChange = this.generateZeroMeanNoise() * Math.sqrt(variance) * stabilityFactor * 0.2;
        
        // 回歸力防止過度漂移
        const regressionForce = -this.cumulativeDriftE * 0.01; // 增強回歸力
        
        // 減少階梯變化
        let stepChange = 0;
        if (this.randomGenerator.next() < 0.04) { // 降低頻率
            stepChange = (this.randomGenerator.next() - 0.5) * Math.sqrt(variance) * 1.0; // 降低幅度
        }
        
        return irregularChange + regressionForce + stepChange;
    }

    /**
     * 其他輔助方法
     */
    private adjustStatsForEnvironment(stats: DataStats, oscillationFactor: number, envNoiseFactor: number): DataStats {
        const adjustedStats = {
            eStdDev: stats.eStdDev * oscillationFactor * envNoiseFactor,
            nStdDev: stats.nStdDev * oscillationFactor * envNoiseFactor,
            hStdDev: stats.hStdDev * oscillationFactor * envNoiseFactor
        };

        adjustedStats.eStdDev = Math.max(adjustedStats.eStdDev, 0.010);
        adjustedStats.nStdDev = Math.max(adjustedStats.nStdDev, 0.010);
        adjustedStats.hStdDev = Math.max(adjustedStats.hStdDev, 0.020);
            
        adjustedStats.eStdDev = Math.min(adjustedStats.eStdDev, 0.020);
        adjustedStats.nStdDev = Math.min(adjustedStats.nStdDev, 0.020);
        adjustedStats.hStdDev = Math.min(adjustedStats.hStdDev, 0.030);

        return adjustedStats;
    }

    private selectDiverseBaseIndex(samplesLength: number, currentIndex: number, totalCount: number): number {
        const progress = currentIndex / totalCount;
        const rangeStart = Math.max(0, Math.floor(samplesLength * (1.0 - progress) * 0.5));
        const rangeEnd = Math.min(samplesLength - 1, Math.max(rangeStart + 1, samplesLength - Math.floor(samplesLength * progress * 0.3)));
        return rangeStart + Math.floor(this.randomGenerator.next() * (rangeEnd - rangeStart + 1));
    }

    private calculateEnhancedStabilityFactor(index: number, totalCount: number, isLongExtension: boolean): number {
        if (isLongExtension) {
            const baseFactor = 1.0 / (1.0 + index * 0.005); // 降低衰減率
            const timeDamping = Math.exp(-index / (totalCount * 2)); // 增加時間常數
            return Math.max(0.2, baseFactor * timeDamping); // 提高最小值
        } else {
            return 1.0 / (1.0 + index * 0.02);
        }
    }

    private generateConservativeTinyVariation(range: number, stabilityFactor: number): number {
        let baseVariation = this.generateZeroMeanNoise() * range * stabilityFactor * 0.1; // 降低幅度
        
        if (this.randomGenerator.next() < 0.05) { // 降低頻率
            baseVariation += this.generateZeroMeanNoise() * range * stabilityFactor * 0.15;
        }
        
        return baseVariation;
    }

    private improvedTransitionCurve(progress: number): number {
        // 使用三次貝茲曲線實現更平滑的過渡
        const t = progress;
        const t2 = t * t;
        const t3 = t2 * t;
        
        // 控制點：(0,0), (0.2, 0), (0.8, 1), (1,1)
        const result = 3 * t2 - 2 * t3;
        
        return Math.max(0, Math.min(1, result));
    }
}
