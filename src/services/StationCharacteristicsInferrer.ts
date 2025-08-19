import { GnssModel } from './GnssModel';
import { StationCharacteristics } from './EnvironmentalFactorCalculator';
import { DataStats } from './StatisticsCalculator';

/**
 * StationCharacteristicsInferrer - 負責站點特性推斷
 * 單一職責：從樣本數據中自動推斷站點特性
 */
export class StationCharacteristicsInferrer {
    
    /**
     * 從樣本數據自動推斷站點特性
     */
    public inferStationCharacteristics(samples: GnssModel[], stats: DataStats): StationCharacteristics {
        if (samples.length === 0) {
            return this.getDefaultStationCharacteristics();
        }
        
        // Extract location information from samples
        const firstSample = samples[0];
        const latitude = firstSample.latitude || 0;
        const longitude = firstSample.longitude || 0;
        const height = firstSample.height || 0;
        
        const avgStdDev = (stats.eStdDev + stats.nStdDev) / 2;
        const heightStdDev = stats.hStdDev;
        
        // Infer environment based on data characteristics and location - optimized for Taiwan mountain regions
        const environment = this.inferEnvironment(height, avgStdDev, heightStdDev);
        const multipath = this.inferMultipath(avgStdDev);
        const atmospheric = this.inferAtmospheric(heightStdDev);
        const installationQuality = this.inferInstallationQuality(avgStdDev, heightStdDev);
        
        return {
            stationId: `auto_inferred_${latitude.toFixed(3)}_${longitude.toFixed(3)}`,
            location: { latitude, longitude, altitude: height },
            environment,
            multipath,
            atmospheric,
            equipment: {
                antennaType: 'survey_grade', // Assume survey grade for static solutions
                receiverModel: 'dual_frequency',
                installationQuality
            }
        };
    }
    
    /**
     * 推斷環境類型
     */
    private inferEnvironment(
        height: number, 
        avgStdDev: number, 
        heightStdDev: number
    ): 'urban' | 'rural' | 'coastal' | 'mountain' | 'forest' {
        // Mountain areas (prioritized for Taiwan) - lowered threshold from 1000m to 500m
        if (height > 500) {
            return 'mountain';
        }
        // High variability might indicate urban environment (multipath) - adjusted thresholds for static GNSS
        else if (avgStdDev > 0.005) { // Reduced from 0.01 for static solutions
            return 'urban';
        }
        // Coastal areas (near sea level with moderate variability)  
        else if (Math.abs(height) < 100 && avgStdDev > 0.002) { // Reduced from 0.005
            return 'coastal';
        }
        // Forest areas (moderate height with high height variability)
        else if (heightStdDev > 0.01 && height > 200) { // Reduced from 0.02
            return 'forest';
        }
        
        return 'mountain'; // Default to mountain for Taiwan
    }
    
    /**
     * 推斷多路徑等級
     */
    private inferMultipath(avgStdDev: number): 'low' | 'medium' | 'high' {
        if (avgStdDev < 0.002) { // Excellent conditions
            return 'low';
        } else if (avgStdDev > 0.004) { // Higher threshold for mountain areas
            return 'high';
        }
        return 'medium'; // Default to medium for mountain areas
    }
    
    /**
     * 推斷大氣條件
     */
    private inferAtmospheric(heightStdDev: number): 'stable' | 'variable' | 'extreme' {
        if (heightStdDev > 0.015) { // Reduced from 0.03
            return 'extreme';
        } else if (heightStdDev > 0.008) { // Reduced from 0.015
            return 'variable';
        }
        return 'variable'; // Default to variable for mountains
    }
    
    /**
     * 推斷安裝品質
     */
    private inferInstallationQuality(avgStdDev: number, heightStdDev: number): 'excellent' | 'good' | 'fair' {
        const overallVariability = avgStdDev + heightStdDev;
        if (overallVariability < 0.005) { // Reduced from 0.01
            return 'excellent';
        } else if (overallVariability > 0.012) { // Reduced from 0.025
            return 'good';
        }
        return 'fair';
    }
    
    /**
     * 獲取預設站點特性（台灣山區）
     */
    public getDefaultStationCharacteristics(): StationCharacteristics {
        return {
            stationId: 'taiwan_mountain_station',
            location: { 
                latitude: 24.0, // Central Taiwan latitude
                longitude: 121.0, // Central Taiwan longitude  
                altitude: 2000 // Typical mountain elevation in meters
            },
            environment: 'mountain', // Taiwan mountain environment
            multipath: 'medium', // Mountain terrain causes moderate multipath
            atmospheric: 'variable', // Mountain weather is more variable
            equipment: {
                antennaType: 'survey_grade', // Professional grade for monitoring stations
                receiverModel: 'dual_frequency', // Dual-frequency receivers for better accuracy
                installationQuality: 'excellent' // Well-maintained monitoring stations
            }
        };
    }
    
    /**
     * 檢測解算類型
     */
    public detectSolutionType(samples: GnssModel[]): 'static' | 'kinematic' {
        if (samples.length < 10) return 'static'; // Default for small samples
        
        // Calculate movement statistics
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
        
        // Static solutions typically have very small movements (mm level)
        if (avgMovement < 0.01 && maxMovement < 0.05) {
            return 'static';
        } else {
            return 'kinematic';
        }
    }
}
