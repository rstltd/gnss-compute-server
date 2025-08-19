import { GnssModel } from './GnssModel';
import { StatisticsCalculator } from './StatisticsCalculator';

/**
 * 兼容性分析結果介面
 */
export interface CompatibilityAnalysis {
    maxDiscontinuity: number;
    averageDiscontinuity: number;
    recommendedTransitionSteps: number;
    isTransitionNeeded: boolean;
}

/**
 * DataCompatibilityAnalyzer - 負責數據兼容性分析
 * 單一職責：分析生成數據與真實數據之間的兼容性和不連續性
 */
export class DataCompatibilityAnalyzer {
    private statisticsCalculator: StatisticsCalculator;
    
    constructor() {
        this.statisticsCalculator = new StatisticsCalculator();
    }
    
    /**
     * 分析生成數據與真實數據的兼容性
     */
    public analyzeDataCompatibility(
        generatedData: GnssModel[],
        realData: GnssModel[]
    ): CompatibilityAnalysis {
        if (generatedData.length === 0 || realData.length === 0) {
            return {
                maxDiscontinuity: 0,
                averageDiscontinuity: 0,
                recommendedTransitionSteps: 0,
                isTransitionNeeded: false
            };
        }
        
        const lastGenerated = generatedData[generatedData.length - 1];
        const firstReal = realData[0];
        
        const deltaE = Math.abs(firstReal.E - lastGenerated.E);
        const deltaN = Math.abs(firstReal.N - lastGenerated.N);
        const deltaH = Math.abs(firstReal.H - lastGenerated.H);
        
        const maxDiscontinuity = Math.max(deltaE, deltaN, deltaH);
        const averageDiscontinuity = (deltaE + deltaN + deltaH) / 3;
        
        // Calculate threshold based on the real data characteristics
        const solutionType = this.detectSolutionType([...generatedData.slice(-10), ...realData.slice(0, 10)]);
        const threshold = this.statisticsCalculator.calculateDiscontinuityThreshold(
            [...generatedData.slice(-10), ...realData.slice(0, 10)], 
            solutionType
        );
        
        const isTransitionNeeded = maxDiscontinuity > threshold;
        const recommendedTransitionSteps = isTransitionNeeded 
            ? Math.min(5, Math.max(2, Math.ceil(maxDiscontinuity / threshold)))
            : 0;
        
        return {
            maxDiscontinuity,
            averageDiscontinuity,
            recommendedTransitionSteps,
            isTransitionNeeded
        };
    }
    
    /**
     * 檢查是否需要過渡數據
     */
    public needsTransition(
        lastGeneratedPoint: GnssModel,
        firstRealPoint: GnssModel,
        threshold: number
    ): boolean {
        const deltaE = Math.abs(firstRealPoint.E - lastGeneratedPoint.E);
        const deltaN = Math.abs(firstRealPoint.N - lastGeneratedPoint.N);
        const deltaH = Math.abs(firstRealPoint.H - lastGeneratedPoint.H);
        const maxDelta = Math.max(deltaE, deltaN, deltaH);
        
        return maxDelta > threshold;
    }
    
    /**
     * 計算適應性過渡步數
     */
    public calculateAdaptiveTransitionSteps(
        maxDelta: number,
        threshold: number,
        generationDurationHours: number,
        minSteps: number = 36,
        maxSteps: number = 288,
        transitionMultiplier: number = 4,
        longGenerationThreshold: number = 12
    ): number {
        const baseTransitionSteps = Math.ceil(maxDelta / threshold * transitionMultiplier);
        
        // For long-term generation, use longer transitions
        const durationBonus = generationDurationHours > longGenerationThreshold ? 
            Math.min(12, Math.ceil(generationDurationHours / longGenerationThreshold)) : 0;
        
        const adaptiveTransitionSteps = Math.min(
            maxSteps, 
            Math.max(minSteps, baseTransitionSteps + durationBonus)
        );
        
        return adaptiveTransitionSteps;
    }
    
    /**
     * 檢測解算類型
     */
    private detectSolutionType(samples: GnssModel[]): 'static' | 'kinematic' {
        if (samples.length < 10) return 'static';
        
        const movements: number[] = [];
        for (let i = 1; i < samples.length; i++) {
            const deltaE = Math.abs(samples[i].E - samples[i-1].E);
            const deltaN = Math.abs(samples[i].N - samples[i-1].N);
            const deltaH = Math.abs(samples[i].H - samples[i-1].H);
            const totalMovement = Math.sqrt(deltaE * deltaE + deltaN * deltaN + deltaH * deltaH);
            movements.push(totalMovement);
        }
        
        const avgMovement = movements.reduce((sum, mv) => sum + mv, 0) / movements.length;
        const maxMovement = Math.max(...movements);
        
        return (avgMovement < 0.01 && maxMovement < 0.05) ? 'static' : 'kinematic';
    }
}
