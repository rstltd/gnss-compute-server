import { GnssModel } from '../models/GnssModel';

export class CoordinateConvertHandler {
    // WGS84 parameters
    private static readonly A = 6378137.0; // semi-major axis
    private static readonly F = 1 / 298.257223563; // flattening
    private static readonly E1_SQ = 1 - (1 - CoordinateConvertHandler.F) * (1 - CoordinateConvertHandler.F); // first eccentricity squared

    // TWD97 TM2 parameters
    private static readonly K0 = 0.9999; // scale factor
    private static readonly DX = 250000; // false easting
    private static readonly DY = 0;
    private static readonly LON0 = CoordinateConvertHandler.toRadians(121); // Use our own toRadians

    private readonly inputSys: string;
    private readonly outputSys: string;

    constructor(inputSys: string, outputSys: string) {
        this.inputSys = inputSys;
        this.outputSys = outputSys;
    }

    // Helper functions for angle conversion
    private static toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private static toDegrees(radians: number): number {
        return radians * (180 / Math.PI);
    }

    public convert(inputGnssModel: GnssModel): GnssModel {
        const outputGnssModel: GnssModel = { ...inputGnssModel }; // Copy input model

        // Adjust data time (+8hr), because data time is UTC time
        const inputDateTime = new Date(inputGnssModel.dateTime);
        inputDateTime.setHours(inputDateTime.getHours() + 8);
        outputGnssModel.dateTime = inputDateTime.toISOString();

        // Convert based on input system
        if (this.inputSys === 'ecef' && this.outputSys === 'wgs84') {
            // ECEF to WGS84
            const wgs84GnssModel = this.convertEcefToWgs84(inputGnssModel);
            outputGnssModel.E = wgs84GnssModel.E;
            outputGnssModel.N = wgs84GnssModel.N;
            outputGnssModel.H = wgs84GnssModel.H;
        } else if (this.inputSys === 'wgs84' && this.outputSys === 'twd97') {
            // WGS84 to TWD97
            const twd97GnssModel = this.convertWgs84ToTwd97(inputGnssModel);
            outputGnssModel.E = twd97GnssModel.E;
            outputGnssModel.N = twd97GnssModel.N;
            outputGnssModel.H = twd97GnssModel.H;
        } else if (this.inputSys === 'ecef' && this.outputSys === 'twd97') {
            // ECEF to TWD97
            const wgs84GnssModel = this.convertEcefToWgs84(inputGnssModel);     // Convert to WGS84 first
            const twd97GnssModel = this.convertWgs84ToTwd97(wgs84GnssModel);    // Then convert to TWD97
            outputGnssModel.E = twd97GnssModel.E;
            outputGnssModel.N = twd97GnssModel.N;
            outputGnssModel.H = twd97GnssModel.H;
        } else {
            // Other cases, return input model directly
            return inputGnssModel;
        }
        return outputGnssModel;
    }

    private convertEcefToWgs84(ecefPointModel: GnssModel): GnssModel {
        const x = ecefPointModel.E;
        const y = ecefPointModel.N;
        const z = ecefPointModel.H;

        const b = CoordinateConvertHandler.A * (1 - CoordinateConvertHandler.F);
        const ep_sq = ((Math.pow(CoordinateConvertHandler.A, 2) - Math.pow(b, 2)) / Math.pow(b, 2));
        const p = Math.sqrt(x * x + y * y);
        const th = Math.atan2(CoordinateConvertHandler.A * z, b * p);
        const lon = Math.atan2(y, x);
        const lat = Math.atan2((z + ep_sq * b * Math.pow(Math.sin(th), 3)),
            (p - CoordinateConvertHandler.E1_SQ * CoordinateConvertHandler.A * Math.pow(Math.cos(th), 3)));
        const N = (CoordinateConvertHandler.A / Math.sqrt(1 - CoordinateConvertHandler.E1_SQ * Math.pow(Math.sin(lat), 2)));
        const alt = (p / Math.cos(lat) - N);

        const wgs84PointModel: GnssModel = { ...ecefPointModel };
        wgs84PointModel.E = CoordinateConvertHandler.toDegrees(lat); // Use our own toDegrees
        wgs84PointModel.N = CoordinateConvertHandler.toDegrees(lon); // Use our own toDegrees
        wgs84PointModel.H = alt;
        return wgs84PointModel;
    }

    private convertWgs84ToTwd97(wgs84PointModel: GnssModel): GnssModel {
        const lat_rad = CoordinateConvertHandler.toRadians(wgs84PointModel.E); // Use our own toRadians
        const lon_rad = CoordinateConvertHandler.toRadians(wgs84PointModel.N); // Use our own toRadians

        const b = CoordinateConvertHandler.A * (1 - CoordinateConvertHandler.F);
        const e2_sq = ((Math.pow(CoordinateConvertHandler.A, 2) - Math.pow(b, 2)) / Math.pow(b, 2));
        const N = (CoordinateConvertHandler.A / Math.sqrt(1 - CoordinateConvertHandler.E1_SQ * Math.pow(Math.sin(lat_rad), 2)));
        const T = Math.pow(Math.tan(lat_rad), 2);
        const C = (e2_sq * Math.pow(Math.cos(lat_rad), 2));
        const innerA = ((lon_rad - CoordinateConvertHandler.LON0) * Math.cos(lat_rad));

        const M = (CoordinateConvertHandler.A * ((1 - CoordinateConvertHandler.E1_SQ / 4 - 3 * Math.pow(CoordinateConvertHandler.E1_SQ, 2) / 64 - 5 * Math.pow(CoordinateConvertHandler.E1_SQ, 3) / 256) * lat_rad
            - (3 * CoordinateConvertHandler.E1_SQ / 8 + 3 * Math.pow(CoordinateConvertHandler.E1_SQ, 2) / 32 + 45 * Math.pow(CoordinateConvertHandler.E1_SQ, 3) / 1024) * Math.sin(2 * lat_rad)
            + (15 * Math.pow(CoordinateConvertHandler.E1_SQ, 2) / 256 + 45 * Math.pow(CoordinateConvertHandler.E1_SQ, 3) / 1024) * Math.sin(4 * lat_rad) - (35 * Math.pow(CoordinateConvertHandler.E1_SQ, 3) / 3072) * Math.sin(6 * lat_rad)));
        const innerX = (CoordinateConvertHandler.K0 * N * (innerA + (1 - T + C) * Math.pow(innerA, 3) / 6
            + (5 - 18 * T + Math.pow(T, 2) + 72 * C - 58 * e2_sq) * Math.pow(innerA, 5) / 120) + CoordinateConvertHandler.DX);
        const innerY = (CoordinateConvertHandler.K0 * (M + N * Math.tan(lat_rad) * (Math.pow(innerA, 2) / 2
            + (5 - T + 9 * C + 4 * Math.pow(C, 2)) * Math.pow(innerA, 4) / 24
            + (61 - 58 * T + Math.pow(T, 2) + 600 * C - 330 * e2_sq) * Math.pow(innerA, 6) / 720)) + CoordinateConvertHandler.DY);

        const twd97PointModel: GnssModel = { ...wgs84PointModel };
        twd97PointModel.E = innerX;
        twd97PointModel.N = innerY;
        twd97PointModel.H = wgs84PointModel.H; // Height remains unchanged
        return twd97PointModel;
    }
}