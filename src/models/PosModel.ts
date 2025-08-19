
export interface PosModel {
    dateTime: string; // Using string for simplicity, can be Date object if needed
    X: number;
    Y: number;
    Z: number;
    sdx: number;
    sdy: number;
    sdz: number;
    ratio: number;
}
