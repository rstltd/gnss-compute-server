/**
 * 站點特性介面
 */
export interface StationCharacteristics {
    stationId: string;
    location: {
        latitude: number;
        longitude: number;
        altitude: number;
    };
    environment: 'urban' | 'rural' | 'coastal' | 'mountain' | 'forest';
    multipath: 'low' | 'medium' | 'high';
    atmospheric: 'stable' | 'variable' | 'extreme';
    equipment: {
        antennaType: string;
        receiverModel: string;
        installationQuality: 'excellent' | 'good' | 'fair';
    };
}

/**
 * 天氣條件介面
 */
export interface WeatherConditions {
    temperature: number;
    humidity: number;
    pressure: number;
    precipitation: boolean;
    cloudCover: number; // 0-1
    visibility: number; // km
}

/**
 * 衛星幾何資訊
 */
export interface SatelliteGeometry {
    pdop: number;
    hdop: number;
    vdop: number;
}

/**
 * EnvironmentalFactorCalculator - 負責環境因素計算
 * 單一職責：處理環境、天氣、衛星幾何等外部因素的影響計算
 */
export class EnvironmentalFactorCalculator {
    
    /**
     * 計算環境噪聲因子
     */
    public calculateEnvironmentalNoiseFactor(
        stationCharacteristics?: StationCharacteristics, 
        timeOfDay?: number
    ): number {
        if (!stationCharacteristics) return 1.0;
        
        const environmentFactors = {
            urban: 1.5,     // 建築物反射和電磁干擾
            rural: 1.0,     // 基準環境
            coastal: 1.2,   // 水面反射效應
            mountain: 1.4,  // 台灣山區：地形影響但視野開闊
            forest: 2.0     // 樹冠遮蔽和信號衰減
        };
        
        const multipathFactors = {
            low: 1.0,
            medium: 1.3,
            high: 1.8
        };
        
        const qualityFactors = {
            excellent: 0.8,
            good: 1.0,
            fair: 1.4
        };
        
        const atmosphericFactors = {
            stable: 1.0,
            variable: 1.2,
            extreme: 1.6
        };
        
        let noiseFactor = environmentFactors[stationCharacteristics.environment] || 1.0;
        noiseFactor *= multipathFactors[stationCharacteristics.multipath] || 1.0;
        noiseFactor *= qualityFactors[stationCharacteristics.equipment.installationQuality] || 1.0;
        noiseFactor *= atmosphericFactors[stationCharacteristics.atmospheric] || 1.0;
        
        // 加入時間因子（電離層日變化）
        if (timeOfDay !== undefined) {
            const ionosphericFactor = 1.0 + 0.3 * Math.sin(2 * Math.PI * timeOfDay / 24);
            noiseFactor *= ionosphericFactor;
        }
        
        // 高度影響（對流層延遲）
        if (stationCharacteristics.location.altitude > 1000) {
            const altitudeFactor = 1.0 + (stationCharacteristics.location.altitude - 1000) / 10000 * 0.2;
            noiseFactor *= altitudeFactor;
        }
        
        return noiseFactor;
    }
    
    /**
     * 應用天氣效應
     */
    public applyWeatherEffects(baseNoise: number, weather?: WeatherConditions): number {
        if (!weather) return baseNoise;
        
        let weatherFactor = 1.0;
        
        // 降水影響信號傳播
        if (weather.precipitation) {
            weatherFactor *= 1.5;
        }
        
        // 雲層影響電離層
        weatherFactor *= (1.0 + weather.cloudCover * 0.2);
        
        // 大氣壓力影響對流層延遲
        const pressureEffect = Math.abs(weather.pressure - 1013.25) / 1013.25 * 0.1;
        weatherFactor *= (1.0 + pressureEffect);
        
        // 濕度影響對流層延遲
        const humidityEffect = Math.max(0, weather.humidity - 50) / 50 * 0.15;
        weatherFactor *= (1.0 + humidityEffect);
        
        // 能見度影響（霧、霾等）
        if (weather.visibility < 10) {
            const visibilityEffect = (10 - weather.visibility) / 10 * 0.3;
            weatherFactor *= (1.0 + visibilityEffect);
        }
        
        return baseNoise * weatherFactor;
    }
    
    /**
     * 計算季節因子
     */
    public calculateSeasonalFactor(dateTime: Date): number {
        const dayOfYear = this.getDayOfYear(dateTime);
        
        // 電離層季節性變化（夏季較強）
        const ionosphericSeasonal = 1.0 + 0.2 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365.25);
        
        // 對流層季節性變化（冬季較穩定）
        const troposphericSeasonal = 1.0 + 0.15 * Math.cos(2 * Math.PI * (dayOfYear - 20) / 365.25);
        
        return ionosphericSeasonal * troposphericSeasonal;
    }
    
    /**
     * 模擬衛星幾何效應
     */
    public simulateSatelliteGeometry(dateTime: Date, location?: { latitude: number; longitude: number }): SatelliteGeometry {
        const hour = dateTime.getHours();
        const minute = dateTime.getMinutes();
        const timeInHours = hour + minute / 60;
        
        // 基本 PDOP 變化（模擬衛星軌道週期）
        let basePDOP = 1.5 + 0.5 * Math.sin(2 * Math.PI * timeInHours / 12); // 12小時週期
        basePDOP += 0.2 * Math.sin(2 * Math.PI * timeInHours / 24); // 24小時週期
        
        // 緯度影響（極地效應）
        if (location) {
            const latitudeEffect = Math.abs(location.latitude) / 90 * 0.4;
            basePDOP += latitudeEffect;
            
            // 赤道附近電離層活動較強
            if (Math.abs(location.latitude) < 30) {
                basePDOP += 0.1;
            }
        }
        
        // 確保 PDOP 在合理範圍內
        const pdop = Math.max(1.0, Math.min(6.0, basePDOP));
        const hdop = pdop * 0.8; // HDOP 通常較小
        const vdop = pdop * 1.2; // VDOP 通常較大
        
        return { pdop, hdop, vdop };
    }
    
    /**
     * 獲取預設天氣條件
     */
    public getDefaultWeatherConditions(): WeatherConditions {
        return {
            temperature: 20,        // 20°C
            humidity: 60,           // 60%
            pressure: 1013.25,      // Standard atmospheric pressure
            precipitation: false,
            cloudCover: 0.3,        // 30% cloud cover
            visibility: 15          // 15 km visibility
        };
    }
    
    /**
     * 獲取年內天數
     */
    private getDayOfYear(date: Date): number {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date.getTime() - start.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }
}
