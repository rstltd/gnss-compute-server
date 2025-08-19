import { GnssModel } from '../models/GnssModel';

/**
 * TimestampManager - 負責時間戳管理
 * 單一職責：處理時間戳的分配、插值和序列管理
 */
export class TimestampManager {
    
    /**
     * 為數據分配連續的時間戳
     */
    public assignSequentialTimestamps(data: GnssModel[], startTime: Date): GnssModel[] {
        for (let i = 0; i < data.length; i++) {
            const timestamp = new Date(startTime.getTime() + i * 10 * 60 * 1000);
            data[i].dateTime = timestamp.toISOString();
        }
        return data;
    }
    
    /**
     * 獲取生成數據的開始時間戳
     */
    public getStartTimestamp(samples: GnssModel[]): Date {
        const lastSample = samples[samples.length - 1];
        const lastDate = new Date(lastSample.dateTime);
        return new Date(lastDate.getTime() + 10 * 60 * 1000); // Add 10 minutes
    }
    
    /**
     * 獲取擴展數據的開始時間戳
     */
    public getExtensionStartTimestamp(lastKnownPoint: GnssModel): Date {
        const lastDate = new Date(lastKnownPoint.dateTime);
        return new Date(lastDate.getTime() + 10 * 60 * 1000); // Add 10 minutes
    }
    
    /**
     * 在兩個時間戳之間插值
     */
    public interpolateTimestamp(startTime: string, endTime: string, progress: number): string {
        const startMs = new Date(startTime).getTime();
        const endMs = new Date(endTime).getTime();
        const interpolatedMs = startMs + (endMs - startMs) * progress;
        return new Date(interpolatedMs).toISOString();
    }
    
    /**
     * 在兩個數值之間插值
     */
    public interpolateValue(start: number, end: number, progress: number): number {
        return start + (end - start) * progress;
    }
    
    /**
     * 計算移動總量
     */
    public calculateMoveTotal(model: GnssModel): number {
        return Math.sqrt((model.moveE || 0) ** 2 + (model.moveN || 0) ** 2 + (model.moveH || 0) ** 2);
    }
}
