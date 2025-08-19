export interface PosRecord {
    dateTime: string;
    xEcef: number;
    yEcef: number;
    zEcef: number;
    Q: number;
    sdx: number;
    sdy: number;
    sdz: number;
    ratio: number;
}

export interface ProcessedResult {
    dateTime: string;
    X: number;
    Y: number;
    Z: number;
    sdx: number;
    sdy: number;
    sdz: number;
}

export class PosDataProcessor {
    private records: PosRecord[] = [];

    /**
     * 解析 .pos 檔案內容
     * @param content .pos 檔案的文字內容
     * @returns 解析後的 PosRecord 陣列
     */
    public parsePosFile(content: string): PosRecord[] {
        const lines = content.split('\n');
        const records: PosRecord[] = [];

        for (const line of lines) {
            // 跳過註解行和空行
            if (line.startsWith('%') || line.trim() === '') {
                continue;
            }

            const parts = line.trim().split(/\s+/);
            
            // 確保有足夠的欄位
            if (parts.length >= 14) {
                try {
                    const dateTime = `${parts[0]} ${parts[1]}`;
                    const xEcef = parseFloat(parts[2]);
                    const yEcef = parseFloat(parts[3]);
                    const zEcef = parseFloat(parts[4]);
                    const Q = parseInt(parts[5]);
                    const sdx = parseFloat(parts[7]);
                    const sdy = parseFloat(parts[8]);
                    const sdz = parseFloat(parts[9]);
                    const ratio = parseFloat(parts[14]);

                    // 驗證數值是否有效
                    if (!isNaN(xEcef) && !isNaN(yEcef) && !isNaN(zEcef) && 
                        !isNaN(Q) && !isNaN(sdx) && !isNaN(sdy) && !isNaN(sdz) && !isNaN(ratio)) {
                        
                        records.push({
                            dateTime,
                            xEcef,
                            yEcef,
                            zEcef,
                            Q,
                            sdx,
                            sdy,
                            sdz,
                            ratio
                        });
                    }
                } catch {
                    // 跳過無法解析的行，繼續處理下一行
                }
            }
        }

        this.records = records;
        return records;
    }

    /**
     * 過濾資料，只保留 Q=1 或 Q=6 的資料
     * @param records 輸入的記錄陣列
     * @returns 過濾後的記錄陣列
     */
    public filterByQuality(records: PosRecord[]): PosRecord[] {
        return records.filter(record => record.Q === 1 || record.Q === 6);
    }

    /**
     * 計算加權平均
     * @param records 過濾後的記錄陣列
     * @returns 處理結果
     */
    public calculateWeightedAverage(records: PosRecord[]): ProcessedResult | null {
        if (records.length === 0) {
            return null;
        }

        let weightedX = 0;
        let weightedY = 0;
        let weightedZ = 0;
        let totalWeight = 0;
        let sumSdx = 0;
        let sumSdy = 0;
        let sumSdz = 0;

        // 獲取最後一筆記錄的時間，並格式化為 'yyyy/MM/dd HH:mm'
        const lastRecord = records[records.length - 1];
        const formattedDateTime = this.formatDateTime(lastRecord.dateTime);

        for (const record of records) {
            // 計算權重
            let weight: number;
            
            if (record.Q === 6) {
                // Q=6 時不考慮 ratio 的權重，只考慮 sd 的倒數
                const sdWeight = 1 / (record.sdx + record.sdy + record.sdz);
                weight = sdWeight;
            } else {
                // Q=1 時考慮 sd 和 ratio 的權重
                const sdWeight = 1 / (record.sdx + record.sdy + record.sdz);
                const ratioWeight = record.ratio;
                weight = sdWeight * ratioWeight;
            }

            // 累加加權值（坐標使用加權平均）
            weightedX += record.xEcef * weight;
            weightedY += record.yEcef * weight;
            weightedZ += record.zEcef * weight;
            totalWeight += weight;

            // 累加 sd 值（計算平均值）
            sumSdx += record.sdx;
            sumSdy += record.sdy;
            sumSdz += record.sdz;
        }

        // 計算結果
        if (totalWeight > 0) {
            return {
                dateTime: formattedDateTime,
                X: weightedX / totalWeight,
                Y: weightedY / totalWeight,
                Z: weightedZ / totalWeight,
                sdx: sumSdx / records.length,  // 平均 sdx
                sdy: sumSdy / records.length,  // 平均 sdy
                sdz: sumSdz / records.length   // 平均 sdz
            };
        }

        return null;
    }

    /**
     * 格式化時間為 'yyyy/MM/dd HH:mm'
     * @param dateTime 原始時間字串 (例如: "2025/01/01 12:34:56.789")
     * @returns 格式化後的時間字串 (例如: "2025/01/01 12:34")
     */
    private formatDateTime(dateTime: string): string {
        try {
            // 移除毫秒部分並解析時間
            const cleanDateTime = dateTime.replace(/\.\d+$/, '');
            const parts = cleanDateTime.split(' ');
            
            if (parts.length >= 2) {
                const datePart = parts[0];  // yyyy/MM/dd
                const timePart = parts[1];  // HH:mm:ss
                
                // 只取 HH:mm 部分
                const timeComponents = timePart.split(':');
                if (timeComponents.length >= 2) {
                    const formattedTime = `${timeComponents[0]}:${timeComponents[1]}`;
                    return `${datePart} ${formattedTime}`;
                }
            }
            
            // 如果解析失敗，返回原始字串
            return dateTime;
        } catch {
            return dateTime;
        }
    }

    /**
     * 完整的處理流程
     * @param content .pos 檔案內容
     * @returns 處理結果
     */
    public process(content: string): ProcessedResult | null {
        // 1. 解析 .pos 檔案
        const allRecords = this.parsePosFile(content);
        
        // 2. 過濾資料，只保留 Q=1 或 Q=6 的資料
        const filteredRecords = this.filterByQuality(allRecords);
        
        // 3. 計算加權平均
        const result = this.calculateWeightedAverage(filteredRecords);
        
        return result;
    }

    /**
     * 獲取解析統計資訊
     */
    public getStats(): { total: number, filtered: number, q1Count: number, q6Count: number } {
        const total = this.records.length;
        const filtered = this.records.filter(r => r.Q === 1 || r.Q === 6);
        const q1Count = this.records.filter(r => r.Q === 1).length;
        const q6Count = this.records.filter(r => r.Q === 6).length;
        
        return {
            total,
            filtered: filtered.length,
            q1Count,
            q6Count
        };
    }
}
