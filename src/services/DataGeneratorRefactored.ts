import { GnssModel } from './GnssModel';
import { RandomNumberGenerator } from './RandomNumberGenerator';
import { StatisticsCalculator, DataStats, ConservativeStats } from './StatisticsCalculator';
import { 
    EnvironmentalFactorCalculator, 
    StationCharacteristics, 
    WeatherConditions 
} from './EnvironmentalFactorCalculator';
import { StationCharacteristicsInferrer } from './StationCharacteristicsInferrer';
import { TimestampManager } from './TimestampManager';
import { DataCompatibilityAnalyzer, CompatibilityAnalysis } from './DataCompatibilityAnalyzer';

/**
 * DataGenerator - 重構後的數據生成器
 * 單一職責：協調各個專門組件來生成GNSS數據
 * 
 * 重構原則：
 * - 將複雜的職責委託給專門的類別
 * - 保持對外接口的一致性
 * - 提高代碼的可維護性和測試性
 */
export class DataGenerator {
    // 過渡常數
    private static readonly DEFAULT_TRANSITION_STEPS = 72;
    private static readonly MAX_TRANSITION_STEPS = 288;
    private static readonly MIN_TRANSITION_STEPS = 36;
    private static readonly TRANSITION_MULTIPLIER = 4;
    private static readonly LONG_GENERATION_THRESHOLD_HOURS = 12;
    private static readonly TRANSITION_VARIATION_SCALE = 0.05;
    
    // 靜態GNSS解算特性
    private static readonly STATIC_OSCILLATION_ENHANCEMENT = 0.05;
    private static readonly STATIC_BASIC_NOISE_FACTOR = 0.15;
    private static readonly STATIC_EXTERNAL_NOISE_FACTOR = 0.3;
    
    // 傳統兼容性常數
    private static readonly OSCILLATION_ENHANCEMENT = 0.2;
    private static readonly BASIC_NOISE_FACTOR = 0.6;
    private static readonly EXTERNAL_NOISE_FACTOR = 1.2;

    // 專門組件
    private randomGenerator: RandomNumberGenerator;
    private statisticsCalculator: StatisticsCalculator;
    private environmentalCalculator: EnvironmentalFactorCalculator;
    private stationInferrer: StationCharacteristicsInferrer;
    private timestampManager: TimestampManager;
    private compatibilityAnalyzer: DataCompatibilityAnalyzer;

    constructor() {
        // 初始化各個專門組件
        this.randomGenerator = new RandomNumberGenerator(42);
        this.statisticsCalculator = new StatisticsCalculator();
        this.environmentalCalculator = new EnvironmentalFactorCalculator();
        this.stationInferrer = new StationCharacteristicsInferrer();
        this.timestampManager = new TimestampManager();
        this.compatibilityAnalyzer = new DataCompatibilityAnalyzer();
    }

    /**
     * Generate random data based on sample data, maintaining GNSS data authenticity characteristics
     * 重構後：使用組件化方式處理複雜邏輯
     */
    public generateRandomData(
        samples: GnssModel[], 
        count: number, 
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        if (samples.length === 0) return [];
        
        // 使用專門組件進行分析和推斷
        const stats = this.statisticsCalculator.analyzeDataStats(samples);
        const inferredCharacteristics = stationCharacteristics || 
            this.stationInferrer.inferStationCharacteristics(samples, stats);
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        const defaultWeather = weatherConditions || 
            this.environmentalCalculator.getDefaultWeatherConditions();
        
        // 重置隨機數生成器
        this.randomGenerator.resetSeed(42 + count);
        const result: GnssModel[] = [];
        
        // 使用環境計算器獲取噪聲因子
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(inferredCharacteristics);
        
        // 應用解算類型特定參數
        const oscillationFactor = solutionType === 'static' 
            ? DataGenerator.STATIC_OSCILLATION_ENHANCEMENT 
            : DataGenerator.OSCILLATION_ENHANCEMENT;
            
        // 調整統計參數
        const adjustedStats = this.adjustStatsForEnvironment(stats, oscillationFactor, envNoiseFactor, solutionType);
        
        // 判斷是否為長間隔
        const isLongGap = count > 12;
        
        // 生成長期趨勢
        const trendE = this.generateLongTermTrend(count, adjustedStats.eStdDev, isLongGap);
        const trendN = this.generateLongTermTrend(count, adjustedStats.nStdDev, isLongGap);
        const trendH = this.generateLongTermTrend(count, adjustedStats.hStdDev, isLongGap);
        
        // 生成數據點
        for (let i = 0; i < count; i++) {
            const baseIndex = this.selectDiverseBaseIndex(samples.length, i, count);
            const baseSample = samples[baseIndex];
            
            const newModel = this.generateSingleDataPoint(
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
     * Generate smooth transition data to bridge generated data with real data
     * 重構後：使用組件化方式處理過渡邏輯
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
        
        // 計算需要平滑的差異
        const deltaE = firstReal.E - lastGenerated.E;
        const deltaN = firstReal.N - lastGenerated.N;
        const deltaH = firstReal.H - lastGenerated.H;
        
        // 創建平滑過渡點
        for (let i = 1; i <= transitionSteps; i++) {
            const progress = i / (transitionSteps + 1);
            const smoothProgress = this.smoothTransitionCurve(progress);
            
            // 添加微妙的隨機變化以保持GNSS真實性
            const variationScale = Math.min(0.001, Math.max(deltaE, deltaN, deltaH) * DataGenerator.TRANSITION_VARIATION_SCALE);
            const randomVariationE = (this.randomGenerator.next() - 0.5) * variationScale;
            const randomVariationN = (this.randomGenerator.next() - 0.5) * variationScale;
            const randomVariationH = (this.randomGenerator.next() - 0.5) * variationScale * 1.5;
            
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
                moveTotal: 0, // Will be calculated
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
     * Enhanced version that automatically detects and fixes discontinuities
     * 重構後：使用組件化方式處理無縫數據生成
     */
    public generateSeamlessData(
        samples: GnssModel[], 
        count: number,
        nextRealData?: GnssModel[],
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        // 生成主要數據
        const mainData = this.generateRandomData(samples, count, stationCharacteristics, weatherConditions);
        
        if (!nextRealData || nextRealData.length === 0) {
            return mainData;
        }
        
        // 檢查是否需要過渡
        const lastGenerated = mainData[mainData.length - 1];
        const firstReal = nextRealData[0];
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        
        const discontinuityThreshold = this.statisticsCalculator.calculateDiscontinuityThreshold(samples, solutionType);
        
        const deltaE = Math.abs(firstReal.E - lastGenerated.E);
        const deltaN = Math.abs(firstReal.N - lastGenerated.N);
        const deltaH = Math.abs(firstReal.H - lastGenerated.H);
        const maxDelta = Math.max(deltaE, deltaN, deltaH);
        
        // 如果不連續性顯著，添加適應性過渡
        if (maxDelta > discontinuityThreshold) {
            const generationDurationHours = mainData.length / 6;
            const adaptiveTransitionSteps = this.compatibilityAnalyzer.calculateAdaptiveTransitionSteps(
                maxDelta, discontinuityThreshold, generationDurationHours,
                DataGenerator.MIN_TRANSITION_STEPS, DataGenerator.MAX_TRANSITION_STEPS,
                DataGenerator.TRANSITION_MULTIPLIER, DataGenerator.LONG_GENERATION_THRESHOLD_HOURS
            );
            
            const transitionData = this.generateTransitionData(mainData, nextRealData, adaptiveTransitionSteps);
            return [...mainData, ...transitionData];
        }
        
        return mainData;
    }

    /**
     * Generate conservative extension for extending to current time
     * 重構後：使用組件化方式處理保守擴展
     */
    public generateConservativeExtension(
        samples: GnssModel[], 
        count: number, 
        lastKnownPoint: GnssModel,
        stationCharacteristics?: StationCharacteristics,
        weatherConditions?: WeatherConditions
    ): GnssModel[] {
        if (samples.length === 0 || count <= 0) return [];
        
        // 自動推斷站點特性
        const stats = this.statisticsCalculator.analyzeDataStats(samples);
        const inferredCharacteristics = stationCharacteristics || 
            this.stationInferrer.inferStationCharacteristics(samples, stats);
        const inferredWeather = weatherConditions || 
            this.environmentalCalculator.getDefaultWeatherConditions();
        
        // 檢測解算類型
        const solutionType = this.stationInferrer.detectSolutionType(samples);
        
        // 使用不同種子以保持一致性
        this.randomGenerator.resetSeed(42 + 999);
        const result: GnssModel[] = [];
        
        // 分析保守特性
        const conservativeStats = this.statisticsCalculator.analyzeConservativeStats(samples);
        
        // 計算環境因子
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(inferredCharacteristics);
        
        // 使用解算類型特定的振盪因子
        const extensionOscillationFactor = solutionType === 'static'
            ? DataGenerator.STATIC_OSCILLATION_ENHANCEMENT * 1.2 * envNoiseFactor
            : DataGenerator.OSCILLATION_ENHANCEMENT * 0.7 * envNoiseFactor;
            
        const adjustedStats = {
            eVariance: conservativeStats.eVariance * extensionOscillationFactor,
            nVariance: conservativeStats.nVariance * extensionOscillationFactor,
            hVariance: conservativeStats.hVariance * extensionOscillationFactor
        };
        
        // 對靜態解算應用更現實的約束
        if (solutionType === 'static') {
            adjustedStats.eVariance = Math.min(adjustedStats.eVariance, 0.015);
            adjustedStats.nVariance = Math.min(adjustedStats.nVariance, 0.015);
            adjustedStats.hVariance = Math.min(adjustedStats.hVariance, 0.025);
        }
        
        // 特殊穩定性策略用於長期擴展
        const isLongExtension = count > 432;
        
        // 追蹤累積變化以避免過度漂移
        let cumulativeE = 0;
        let cumulativeN = 0;
        let cumulativeH = 0;
        
        for (let i = 0; i < count; i++) {
            const newModel = this.generateConservativeDataPoint(
                i, count, lastKnownPoint, adjustedStats, 
                inferredCharacteristics, inferredWeather, isLongExtension,
                cumulativeE, cumulativeN, cumulativeH
            );
            
            // 更新累積變化
            cumulativeE = newModel.E - lastKnownPoint.E;
            cumulativeN = newModel.N - lastKnownPoint.N;
            cumulativeH = newModel.H - lastKnownPoint.H;
            
            result.push(newModel);
        }
        
        return this.timestampManager.assignSequentialTimestamps(
            result, 
            this.timestampManager.getExtensionStartTimestamp(lastKnownPoint)
        );
    }

    /**
     * Analyze the compatibility between generated and real data
     * 委託給專門的兼容性分析器
     */
    public analyzeDataCompatibility(
        generatedData: GnssModel[],
        realData: GnssModel[]
    ): CompatibilityAnalysis {
        return this.compatibilityAnalyzer.analyzeDataCompatibility(generatedData, realData);
    }

    // ==================== 私有輔助方法 ====================
    
    /**
     * 調整統計參數以適應環境
     */
    private adjustStatsForEnvironment(
        stats: DataStats, 
        oscillationFactor: number, 
        envNoiseFactor: number, 
        solutionType: 'static' | 'kinematic'
    ): DataStats {
        const adjustedStats = {
            eStdDev: stats.eStdDev * oscillationFactor * envNoiseFactor,
            nStdDev: stats.nStdDev * oscillationFactor * envNoiseFactor,
            hStdDev: stats.hStdDev * oscillationFactor * envNoiseFactor
        };

        // 對靜態解算應用額外約束
        if (solutionType === 'static') {
            adjustedStats.eStdDev = Math.max(adjustedStats.eStdDev, 0.001);
            adjustedStats.nStdDev = Math.max(adjustedStats.nStdDev, 0.001);
            adjustedStats.hStdDev = Math.max(adjustedStats.hStdDev, 0.002);
            
            adjustedStats.eStdDev = Math.min(adjustedStats.eStdDev, 0.01);
            adjustedStats.nStdDev = Math.min(adjustedStats.nStdDev, 0.01);
            adjustedStats.hStdDev = Math.min(adjustedStats.hStdDev, 0.02);
        }

        return adjustedStats;
    }

    /**
     * 生成單個數據點
     */
    private generateSingleDataPoint(
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

        // 計算時間相關因子
        const startTime = this.timestampManager.getStartTimestamp(samples);
        const currentTime = new Date(startTime.getTime() + index * 10 * 60 * 1000);
        const timeOfDay = currentTime.getHours() + currentTime.getMinutes() / 60;
        const seasonalFactor = this.environmentalCalculator.calculateSeasonalFactor(currentTime);

        // 獲取衛星幾何效應
        const satGeometry = this.environmentalCalculator.simulateSatelliteGeometry(currentTime, characteristics?.location);
        const geometryFactor = Math.sqrt(satGeometry.pdop / 2.0);

        // 生成時間相關噪聲
        let timeBasedNoiseE = this.generateTimeBasedNoise(index, totalCount, stats.eStdDev, solutionType);
        let timeBasedNoiseN = this.generateTimeBasedNoise(index, totalCount, stats.nStdDev, solutionType);
        let timeBasedNoiseH = this.generateTimeBasedNoise(index, totalCount, stats.hStdDev, solutionType);

        // 應用環境噪聲因子
        const timeVaryingEnvFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics, timeOfDay);
        timeBasedNoiseE = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseE * timeVaryingEnvFactor, weather);
        timeBasedNoiseN = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseN * timeVaryingEnvFactor, weather);
        timeBasedNoiseH = this.environmentalCalculator.applyWeatherEffects(timeBasedNoiseH * timeVaryingEnvFactor, weather);

        // 應用季節性和衛星幾何效應
        timeBasedNoiseE *= seasonalFactor * geometryFactor;
        timeBasedNoiseN *= seasonalFactor * geometryFactor;
        timeBasedNoiseH *= seasonalFactor * geometryFactor * 1.2;

        newModel.E = baseSample.E + trendE + timeBasedNoiseE;
        newModel.N = baseSample.N + trendN + timeBasedNoiseN;
        newModel.H = baseSample.H + trendH + timeBasedNoiseH;

        // 其他欄位使用更自然的變化
        const angleVariation = this.generateAdaptiveVariation(index, totalCount, 0.1, isLongGap);
        const axisVariation = this.generateAdaptiveVariation(index, totalCount, 0.05, isLongGap);
        const plateVariation = this.generateAdaptiveVariation(index, totalCount, 0.05, isLongGap);

        newModel.angle = (baseSample.angle || 0) + angleVariation;
        newModel.axis = (baseSample.axis || 0) + axisVariation;
        newModel.plate = (baseSample.plate || 0) + plateVariation;

        // Move 欄位考慮時間相關性
        newModel.moveE = (baseSample.moveE || 0) + this.generateAdaptiveVariation(index, totalCount, stats.eStdDev * 0.15, isLongGap);
        newModel.moveN = (baseSample.moveN || 0) + this.generateAdaptiveVariation(index, totalCount, stats.nStdDev * 0.15, isLongGap);
        newModel.moveH = (baseSample.moveH || 0) + this.generateAdaptiveVariation(index, totalCount, stats.hStdDev * 0.15, isLongGap);
        newModel.moveTotal = this.timestampManager.calculateMoveTotal(newModel);

        // Day 欄位使用更大的變化範圍
        newModel.dayE = (baseSample.dayE || 0) + this.generateAdaptiveVariation(index, totalCount, stats.eStdDev * 0.3, isLongGap);
        newModel.dayN = (baseSample.dayN || 0) + this.generateAdaptiveVariation(index, totalCount, stats.nStdDev * 0.3, isLongGap);
        newModel.dayH = (baseSample.dayH || 0) + this.generateAdaptiveVariation(index, totalCount, stats.hStdDev * 0.3, isLongGap);

        return newModel;
    }

    /**
     * 生成保守數據點
     */
    private generateConservativeDataPoint(
        index: number,
        totalCount: number,
        basePoint: GnssModel,
        stats: ConservativeStats,
        characteristics: StationCharacteristics,
        weather: WeatherConditions,
        isLongExtension: boolean,
        cumulativeE: number,
        cumulativeN: number,
        cumulativeH: number
    ): GnssModel {
        const newModel: GnssModel = {
            dateTime: '',
            E: 0, N: 0, H: 0,
            latitude: basePoint.latitude || 0,
            longitude: basePoint.longitude || 0,
            height: basePoint.height || 0,
            angle: 0, axis: 0, plate: 0,
            moveE: 0, moveN: 0, moveH: 0, moveTotal: 0,
            dayE: 0, dayN: 0, dayH: 0
        };

        // 計算時間相關因子
        const currentTime = new Date(this.timestampManager.getExtensionStartTimestamp(basePoint).getTime() + index * 10 * 60 * 1000);
        const timeOfDay = currentTime.getHours() + currentTime.getMinutes() / 60;
        const seasonalFactor = this.environmentalCalculator.calculateSeasonalFactor(currentTime);

        // 獲取衛星幾何效應（保守版本）
        const satGeometry = this.environmentalCalculator.simulateSatelliteGeometry(currentTime, characteristics?.location);
        const conservativeGeometryFactor = Math.sqrt(satGeometry.pdop / 3.0);

        // 動態穩定性因子
        const baseStabilityFactor = this.calculateDynamicStabilityFactor(index, totalCount, isLongExtension);
        const envNoiseFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics);
        const envStabilityFactor = baseStabilityFactor / Math.max(1.0, envNoiseFactor * 0.5);

        // E, N, H 坐標使用增強隨機游走
        const eChange = this.generateEnhancedRandomWalk(stats.eVariance, envStabilityFactor, cumulativeE, index, totalCount, 'static');
        const nChange = this.generateEnhancedRandomWalk(stats.nVariance, envStabilityFactor, cumulativeN, index, totalCount, 'static');
        const hChange = this.generateEnhancedRandomWalk(stats.hVariance, envStabilityFactor, cumulativeH, index, totalCount, 'static');

        // 應用環境效應（保守版本）
        const timeVaryingEnvFactor = this.environmentalCalculator.calculateEnvironmentalNoiseFactor(characteristics, timeOfDay) * 0.5;
        const adjustedEChange = this.environmentalCalculator.applyWeatherEffects(eChange * timeVaryingEnvFactor, weather);
        const adjustedNChange = this.environmentalCalculator.applyWeatherEffects(nChange * timeVaryingEnvFactor, weather);
        const adjustedHChange = this.environmentalCalculator.applyWeatherEffects(hChange * timeVaryingEnvFactor, weather);

        // 應用季節性和保守幾何效應
        newModel.E = basePoint.E + cumulativeE + adjustedEChange * seasonalFactor * conservativeGeometryFactor;
        newModel.N = basePoint.N + cumulativeN + adjustedNChange * seasonalFactor * conservativeGeometryFactor;
        newModel.H = basePoint.H + cumulativeH + adjustedHChange * seasonalFactor * conservativeGeometryFactor * 1.1;

        // 其他欄位使用基準值加微小變化
        newModel.angle = (basePoint.angle || 0) + this.generateAdaptiveTinyVariation(0.5, envStabilityFactor);
        newModel.axis = (basePoint.axis || 0) + this.generateAdaptiveTinyVariation(0.1, envStabilityFactor);
        newModel.plate = (basePoint.plate || 0) + this.generateAdaptiveTinyVariation(0.1, envStabilityFactor);

        // Move 欄位使用保守估計
        newModel.moveE = this.generateAdaptiveTinyVariation(stats.eVariance * 0.5, envStabilityFactor);
        newModel.moveN = this.generateAdaptiveTinyVariation(stats.nVariance * 0.5, envStabilityFactor);
        newModel.moveH = this.generateAdaptiveTinyVariation(stats.hVariance * 0.5, envStabilityFactor);
        newModel.moveTotal = this.timestampManager.calculateMoveTotal(newModel);

        // Day 欄位保持相對穩定
        newModel.dayE = (basePoint.dayE || 0) + this.generateAdaptiveTinyVariation(stats.eVariance * 0.3, envStabilityFactor);
        newModel.dayN = (basePoint.dayN || 0) + this.generateAdaptiveTinyVariation(stats.nVariance * 0.3, envStabilityFactor);
        newModel.dayH = (basePoint.dayH || 0) + this.generateAdaptiveTinyVariation(stats.hVariance * 0.3, envStabilityFactor);

        return newModel;
    }

    /**
     * 生成長期趨勢
     */
    private generateLongTermTrend(count: number, stdDev: number, isLongGap: boolean): number[] {
        const trend: number[] = [];
        
        if (!isLongGap) {
            for (let i = 0; i < count; i++) {
                trend.push(this.randomGenerator.gaussianRandom() * stdDev * 0.2);
            }
            return trend;
        }
        
        // 長間隔的複雜趨勢模式
        const basePattern: number[] = [];
        const periodicComponent: number[] = [];
        
        const trendMagnitude = stdDev * 0.8;
        let currentTrend = (this.randomGenerator.next() - 0.5) * trendMagnitude;
        let trendChange = (this.randomGenerator.next() - 0.5) * trendMagnitude * 0.1;
        
        for (let i = 0; i < count; i++) {
            basePattern.push(currentTrend);
            currentTrend += trendChange;
            if (this.randomGenerator.next() < 0.1) {
                trendChange = (this.randomGenerator.next() - 0.5) * trendMagnitude * 0.1;
            }
        }
        
        const period = 24 + this.randomGenerator.gaussianRandom() * 6;
        const amplitude = stdDev * 0.3;
        const phaseShift = this.randomGenerator.next() * 2 * Math.PI;
        
        for (let i = 0; i < count; i++) {
            periodicComponent.push(amplitude * Math.sin(2 * Math.PI * i / period + phaseShift));
            trend.push(basePattern[i] + periodicComponent[i]);
        }
        
        return trend;
    }

    /**
     * 選擇多樣化的基準索引
     */
    private selectDiverseBaseIndex(samplesLength: number, currentIndex: number, totalCount: number): number {
        const progress = currentIndex / totalCount;
        
        const rangeStart = Math.max(0, Math.floor(samplesLength * (1.0 - progress) * 0.5));
        const rangeEnd = Math.min(samplesLength - 1, Math.max(rangeStart + 1, samplesLength - Math.floor(samplesLength * progress * 0.3)));
        
        return rangeStart + Math.floor(this.randomGenerator.next() * (rangeEnd - rangeStart + 1));
    }

    /**
     * 生成時間相關噪聲
     */
    private generateTimeBasedNoise(index: number, totalCount: number, stdDev: number, solutionType: 'static' | 'kinematic'): number {
        const basicNoiseFactor = solutionType === 'static' 
            ? DataGenerator.STATIC_BASIC_NOISE_FACTOR 
            : DataGenerator.BASIC_NOISE_FACTOR;
            
        const externalNoiseFactor = solutionType === 'static'
            ? DataGenerator.STATIC_EXTERNAL_NOISE_FACTOR
            : DataGenerator.EXTERNAL_NOISE_FACTOR;
        
        // 生成不規則GNSS類變化
        let baseNoise = this.generateIrregularGnssVariation(stdDev * stdDev, index, totalCount, solutionType) * basicNoiseFactor;
        
        // 不太可預測的時間因子
        const timeProgress = index / totalCount;
        
        // 創建不規則時間調制
        const irregularTimeFactor = 1.0 + 
            0.3 * Math.sin(2 * Math.PI * timeProgress * (2 + this.randomGenerator.next())) +
            0.2 * Math.sin(2 * Math.PI * timeProgress * (0.5 + this.randomGenerator.next() * 2)) +
            0.1 * (this.randomGenerator.next() - 0.5) * 2;
        
        const externalNoiseProb = solutionType === 'static' ? 0.04 : 0.08;
        
        if (this.randomGenerator.next() < externalNoiseProb) {
            const burstNoise = this.generateIrregularGnssVariation(stdDev * stdDev, index, totalCount, solutionType) * externalNoiseFactor;
            baseNoise += burstNoise;
        }
        
        const conservativeTimeFactor = solutionType === 'static' ? irregularTimeFactor * 0.8 : irregularTimeFactor;
        
        return baseNoise * conservativeTimeFactor;
    }

    /**
     * 生成不規則GNSS變化
     */
    private generateIrregularGnssVariation(baseVariance: number, index: number, totalCount: number, solutionType: 'static' | 'kinematic'): number {
        // 多層噪聲生成以創建不規則模式
        
        // 層 1: 基本隨機分量
        let variation = this.randomGenerator.gaussianRandom() * Math.sqrt(baseVariance);
        
        // 層 2: 突然跳躍
        if (this.randomGenerator.next() < 0.12) {
            const jumpMagnitude = solutionType === 'static' ? 2.0 : 3.5;
            variation += (this.randomGenerator.next() - 0.5) * Math.sqrt(baseVariance) * jumpMagnitude;
        }
        
        // 層 3: 聚集效應
        const clusterPhase = Math.sin(2 * Math.PI * index / (8 + this.randomGenerator.next() * 12));
        if (Math.abs(clusterPhase) > 0.6) {
            variation *= 1.8 + this.randomGenerator.next() * 0.7;
        } else if (Math.abs(clusterPhase) < 0.2) {
            variation *= 0.3 + this.randomGenerator.next() * 0.4;
        }
        
        // 層 4: 隨機爆發
        if (this.randomGenerator.next() < 0.05) {
            const burstIntensity = 1.5 + this.randomGenerator.next() * 2.0;
            variation *= burstIntensity;
        }
        
        // 層 5: 時間相關性中斷
        if (this.randomGenerator.next() < 0.08) {
            variation *= (this.randomGenerator.next() - 0.5) * 4;
        }
        
        // 層 6: 多頻率分量
        const highFreq = Math.sin(2 * Math.PI * index / 3) * 0.2;
        const midFreq = Math.sin(2 * Math.PI * index / 15) * 0.4;
        const lowFreq = Math.sin(2 * Math.PI * index / 50) * 0.3;
        
        const frequencyComponent = (highFreq + midFreq + lowFreq) * Math.sqrt(baseVariance) * 0.5;
        
        const irregularWeight = 0.7 + this.randomGenerator.next() * 0.6;
        
        return (variation + frequencyComponent) * irregularWeight;
    }

    /**
     * 生成適應性變化
     */
    private generateAdaptiveVariation(index: number, totalCount: number, baseRange: number, isLongGap: boolean): number {
        let variation = this.generateIrregularGnssVariation(baseRange * baseRange, index, totalCount, 'static') * 0.8;
        
        if (isLongGap) {
            const phaseVariation = Math.sin(Math.PI * index / totalCount * (2 + this.randomGenerator.next()));
            const enhancementFactor = 1.2 + 0.8 * Math.abs(phaseVariation);
            variation *= enhancementFactor;
            
            if (this.randomGenerator.next() < 0.15) {
                const burstFactor = 2 + this.randomGenerator.next() * 3;
                variation *= burstFactor;
            }
            
            if (this.randomGenerator.next() < 0.1) {
                variation *= 0.2 + this.randomGenerator.next() * 0.3;
            }
        }
        
        return variation;
    }

    /**
     * 生成適應性微小變化
     */
    private generateAdaptiveTinyVariation(range: number, stabilityFactor: number): number {
        let baseVariation = this.randomGenerator.gaussianRandom() * range * stabilityFactor * 0.2;
        
        if (this.randomGenerator.next() < 0.1) {
            baseVariation += this.randomGenerator.gaussianRandom() * range * stabilityFactor * 0.3;
        }
        
        return baseVariation;
    }

    /**
     * 計算動態穩定性因子
     */
    private calculateDynamicStabilityFactor(index: number, totalCount: number, isLongExtension: boolean): number {
        if (isLongExtension) {
            const baseFactor = 1.0 / (1.0 + index * 0.01);
            const timeDamping = Math.exp(-index / totalCount);
            return Math.max(0.1, baseFactor * timeDamping);
        } else {
            return 1.0 / (1.0 + index * 0.05);
        }
    }

    /**
     * 生成增強隨機游走
     */
    private generateEnhancedRandomWalk(
        variance: number, 
        stabilityFactor: number, 
        cumulativeChange: number, 
        index: number, 
        totalCount: number, 
        solutionType: 'static' | 'kinematic'
    ): number {
        // 基本不規則變化
        const irregularChange = this.generateIrregularGnssVariation(variance, index, totalCount, solutionType) * stabilityFactor * 0.3;
        
        // 回歸力防止過度漂移
        const regressionForce = -cumulativeChange * 0.006;
        
        // 階梯變化
        let stepChange = 0;
        if (this.randomGenerator.next() < 0.08) {
            const stepMagnitude = solutionType === 'static' ? 1.5 : 2.5;
            stepChange = (this.randomGenerator.next() - 0.5) * Math.sqrt(variance) * stepMagnitude;
        }
        
        // 記憶效應
        let memoryEffect = 0;
        if (index > 0 && this.randomGenerator.next() < 0.3) {
            const memoryStrength = 0.2 * stabilityFactor;
            memoryEffect = Math.sign(cumulativeChange) * Math.sqrt(variance) * memoryStrength;
            
            if (this.randomGenerator.next() < 0.3) {
                memoryEffect *= -1;
            }
        }
        
        return irregularChange + regressionForce + stepChange + memoryEffect;
    }

    /**
     * 平滑過渡曲線
     */
    private smoothTransitionCurve(progress: number): number {
        const steepness = 0.6;
        const adjusted = (progress - 0.5) * (2 / steepness);
        const sigmoid = 1 / (1 + Math.exp(-adjusted));
        
        let result = (sigmoid - 1 / (1 + Math.exp(0.5 / steepness))) / 
                    (1 / (1 + Math.exp(-0.5 / steepness)) - 1 / (1 + Math.exp(0.5 / steepness)));
        
        result = result * result * (3 - 2 * result);
        
        return Math.max(0, Math.min(1, result));
    }
}
