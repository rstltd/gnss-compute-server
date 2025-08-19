
import { GnssModel } from './GnssModel';
import { DataGenerator } from './DataGenerator';

export class DataInterpolationHandler {
    
    // Deterministic mode: when set to true, use fixed time point to ensure reproducibility
    private static readonly DETERMINISTIC_MODE = false;
    private static readonly FIXED_END_TIME = new Date('2025-07-28T19:10:00.000Z');

    private readonly originalGnssModels: GnssModel[];
    private readonly dataGenerator: DataGenerator;

    constructor(originalGnssModels: GnssModel[]) {
        this.originalGnssModels = originalGnssModels;
        this.dataGenerator = new DataGenerator();
    }

    public interpolationData(): GnssModel[] {
        const interpolationPastData: GnssModel[] = [];

        // First add the first original data (important: cannot be omitted)
        if (this.originalGnssModels.length > 0) {
            interpolationPastData.push(this.originalGnssModels[0]);
        }

        // Interpolate past data with gaps greater than 10 minutes
        const count = this.originalGnssModels.length;
        for (let i = 1; i < count; i++) {
            const prevDateTime = new Date(this.originalGnssModels[i - 1].dateTime);
            const currDateTime = new Date(this.originalGnssModels[i].dateTime);
            const timeDiff = Math.abs(currDateTime.getTime() - prevDateTime.getTime()) / (1000 * 60); // Difference in minutes

            if (timeDiff > 10) {
                const diffCount = Math.floor((timeDiff / 10) - 1);
                const from = Math.max(0, i - 288);
                const to = i;
                if (from < to) {
                    const pastDataArray = this.originalGnssModels.slice(from, to);
                    // Filter null values to ensure interpolation sample quality
                    const filteredPastDataArray = pastDataArray.filter(model => model !== null && model !== undefined);
                    if (filteredPastDataArray.length > 0) {
                        console.log(`� 使用統計方法填補 ${diffCount} 個數據點`);
                        const generatedData = this.dataGenerator.generateRandomData(filteredPastDataArray, diffCount);
                        
                        if (generatedData.length > 0) {
                            interpolationPastData.push(...generatedData);
                        }
                    }
                }
            }
            interpolationPastData.push(this.originalGnssModels[i]);
        }

        // Interpolate between last data point and current time (conservative extension strategy, no time limit)
        const interpolationData: GnssModel[] = [...interpolationPastData];

        const size = interpolationData.length;
        if (size === 0) return [];
        const lastGnssModel = interpolationData[size - 1];

        // Use deterministic mode to ensure reproducibility
        const nowDateTime = DataInterpolationHandler.DETERMINISTIC_MODE ? 
            DataInterpolationHandler.FIXED_END_TIME : new Date();
        console.log(`🕐 當前時間 (UTC): ${nowDateTime.toISOString()}`);
        console.log(`🕐 當前時間 (本地): ${nowDateTime.toString()}`);
        
        const offsetNowDateTime = new Date(nowDateTime.getTime());
        offsetNowDateTime.setMinutes(Math.ceil(offsetNowDateTime.getMinutes() / 10) * 10);
        offsetNowDateTime.setSeconds(0);
        offsetNowDateTime.setMilliseconds(0);
        console.log(`🕐 調整後時間 (UTC): ${offsetNowDateTime.toISOString()}`);
        
        const lastDateTime = new Date(lastGnssModel.dateTime);
        const timeDiff = Math.abs(offsetNowDateTime.getTime() - lastDateTime.getTime()) / (1000 * 60); // Difference in minutes
        
        if (timeDiff > 10) {
            const diffCount = Math.floor(timeDiff / 10);
            
            // Remove time limit but provide extension length information
            console.log(`🕐 延伸到當前時間: ${Math.floor(diffCount / 6)} 小時 (${diffCount} 個時間點)`);

            // Use larger range of historical data as baseline to increase stability
            const to = Math.min(size, this.originalGnssModels.length);
            const from = Math.max(0, to - 432); // Use last 72 hours of data as reference baseline
            
            if (from < to) {
                const pastDataArray = this.originalGnssModels.slice(from, to);
                const filteredPastDataArray = pastDataArray.filter(model => model !== null && model !== undefined);
                
                if (filteredPastDataArray.length > 0) {
                    console.log(` 使用統計保守延續方法`);
                    const generatedData = this.dataGenerator.generateConservativeExtension(
                        filteredPastDataArray, diffCount, lastGnssModel);
                    
                    if (generatedData.length > 0) {
                        interpolationData.push(...generatedData);
                    }
                }
            }
        }
        return interpolationData;
    }
}
