import { GnssModel } from './GnssModel';

/**
 * 數據統計介面
 */
export interface DataStats {
    eStdDev: number;
    nStdDev: number;
    hStdDev: number;
}

/**
 * 保守統計介面
 */
export interface ConservativeStats {
    eVariance: number;
    nVariance: number;
    hVariance: number;
}

/**
 * StatisticsCalculator - 負責統計計算
 * 單一職責：處理數據統計分析計算
 */
export class StatisticsCalculator {
    
    /**
     * 分析GNSS數據統計特性
     */
    public analyzeDataStats(samples: GnssModel[]): DataStats {
        if (samples.length < 2) {
            // Return realistic minimums for dual-frequency static GNSS
            return {
                eStdDev: 0.002,  // 2mm horizontal
                nStdDev: 0.002,  // 2mm horizontal
                hStdDev: 0.005   // 5mm vertical
            };
        }
        
        const eValues = samples.map(s => s.E);
        const nValues = samples.map(s => s.N);
        const hValues = samples.map(s => s.H);
        
        return {
            eStdDev: Math.max(this.calculateStandardDeviation(eValues), 0.001),  // Min 1mm
            nStdDev: Math.max(this.calculateStandardDeviation(nValues), 0.001),  // Min 1mm
            hStdDev: Math.max(this.calculateStandardDeviation(hValues), 0.002)   // Min 2mm
        };
    }
    
    /**
     * 分析保守統計特性
     */
    public analyzeConservativeStats(samples: GnssModel[]): ConservativeStats {
        if (samples.length < 10) {
            return {
                eVariance: 0.0003,  // Conservative values for dual-frequency static GNSS
                nVariance: 0.0003,
                hVariance: 0.0008
            };
        }
        
        const windowSize = Math.min(samples.length, 144); // Use last 24 hours max
        const startIndex = samples.length - windowSize;
        
        const eChanges: number[] = [];
        const nChanges: number[] = [];
        const hChanges: number[] = [];
        
        for (let i = 1; i < windowSize; i++) {
            eChanges.push(Math.abs(samples[startIndex + i].E - samples[startIndex + i - 1].E));
            nChanges.push(Math.abs(samples[startIndex + i].N - samples[startIndex + i - 1].N));
            hChanges.push(Math.abs(samples[startIndex + i].H - samples[startIndex + i - 1].H));
        }
        
        return {
            eVariance: Math.max(this.calculateMedian(eChanges), 0.0002) * 0.3,  // Conservative multiplier
            nVariance: Math.max(this.calculateMedian(nChanges), 0.0002) * 0.3,
            hVariance: Math.max(this.calculateMedian(hChanges), 0.0005) * 0.3
        };
    }
    
    /**
     * 計算標準差
     */
    public calculateStandardDeviation(values: number[]): number {
        if (values.length < 2) return 0.001;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (values.length - 1);
        
        return Math.sqrt(variance);
    }
    
    /**
     * 計算中位數
     */
    public calculateMedian(values: number[]): number {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        } else {
            return sorted[middle];
        }
    }
    
    /**
     * 計算不連續性閾值
     */
    public calculateDiscontinuityThreshold(samples: GnssModel[], solutionType: 'static' | 'kinematic'): number {
        if (samples.length < 2) return 0.01; // Default 1cm threshold
        
        const stats = this.analyzeDataStats(samples);
        
        // Calculate threshold based on data quality and solution type
        const baseThreshold = solutionType === 'static' ? 0.005 : 0.02; // 5mm for static, 2cm for kinematic
        const avgVariability = (stats.eStdDev + stats.nStdDev + stats.hStdDev) / 3;
        
        // Adaptive threshold: 3-5 times the average variability, with reasonable bounds
        const adaptiveThreshold = Math.max(baseThreshold, Math.min(0.05, avgVariability * 4));
        
        return adaptiveThreshold;
    }
    
    /**
     * 計算歷史數據的中位數參考點
     */
    public calculateMedianReference(samples: GnssModel[]): { E: number; N: number; H: number } {
        if (samples.length === 0) {
            return { E: 0, N: 0, H: 0 };
        }
        
        const eValues = samples.map(s => s.E);
        const nValues = samples.map(s => s.N);
        const hValues = samples.map(s => s.H);
        
        return {
            E: this.calculateMedian(eValues),
            N: this.calculateMedian(nValues),
            H: this.calculateMedian(hValues)
        };
    }
}
