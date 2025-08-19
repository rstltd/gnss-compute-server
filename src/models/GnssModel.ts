
export interface GnssModel {
    dateTime: string; // Using string for simplicity, can be Date object if needed
    E: number;
    N: number;
    H: number;
    latitude: number;
    longitude: number;
    height: number;
    angle?: number;
    axis?: number;
    plate?: number;
    moveE?: number;
    moveN?: number;
    moveH?: number;
    moveTotal?: number;
    dayE?: number;
    dayN?: number;
    dayH?: number;
}
