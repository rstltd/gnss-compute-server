import { GnssModel } from '../models/GnssModel';

function formatDateTime(dateTimeString: string): string {
    const date = new Date(dateTimeString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

interface XmlFieldPrecision {
    E: number;
    N: number;
    H: number;
    latitude: number;
    longitude: number;
    height: number;
    angle: number;
    axis: number;
    plate: number;
    moveE: number;
    moveN: number;
    moveH: number;
    moveTotal: number;
    dayE: number;
    dayN: number;
    dayH: number;
}

export class XmlFormatterHandler {
    private data: GnssModel[];
    private precision: XmlFieldPrecision;

    constructor(data: GnssModel[], customPrecision?: Partial<XmlFieldPrecision>) {
        this.data = data;
        
        // Default precision settings for XML output
        const defaultPrecision: XmlFieldPrecision = {
            E: 4,          // Coordinate values - 4 decimal places
            N: 4,          // Coordinate values - 4 decimal places
            H: 4,          // Height values - 4 decimal places
            latitude: 4,   // Latitude - 4 decimal places
            longitude: 4,  // Longitude - 4 decimal places
            height: 4,     // Height - 4 decimal places
            angle: 1,      // Angle values - 1 decimal place
            axis: 1,       // Axis displacement - 1 decimal place
            plate: 1,      // Plate displacement - 1 decimal place
            moveE: 1,      // Movement values - 1 decimal place
            moveN: 1,      // Movement values - 1 decimal place
            moveH: 1,      // Movement values - 1 decimal place
            moveTotal: 1,  // Total movement - 1 decimal place
            dayE: 4,       // Daily average coordinates - 4 decimal places
            dayN: 4,       // Daily average coordinates - 4 decimal places
            dayH: 4,       // Daily average coordinates - 4 decimal places
        };
        
        this.precision = { ...defaultPrecision, ...customPrecision };
    }

    private formatNumber(value: number | undefined, decimals: number): string {
        if (value === undefined || value === null || isNaN(value)) return '';
        return value.toFixed(decimals);
    }

    public formatToXml(): string {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<GnssData>';
        this.data.forEach(item => {
            xml += `
  <Record>
    <DateTime>${formatDateTime(item.dateTime)}</DateTime>
    <E>${this.formatNumber(item.E, this.precision.E)}</E>
    <N>${this.formatNumber(item.N, this.precision.N)}</N>
    <H>${this.formatNumber(item.H, this.precision.H)}</H>
    <Latitude>${this.formatNumber(item.latitude, this.precision.latitude)}</Latitude>
    <Longitude>${this.formatNumber(item.longitude, this.precision.longitude)}</Longitude>
    <Height>${this.formatNumber(item.height, this.precision.height)}</Height>
    <Angle>${this.formatNumber(item.angle, this.precision.angle)}</Angle>
    <Axis>${this.formatNumber(item.axis, this.precision.axis)}</Axis>
    <Plate>${this.formatNumber(item.plate, this.precision.plate)}</Plate>
    <MoveE>${this.formatNumber(item.moveE, this.precision.moveE)}</MoveE>
    <MoveN>${this.formatNumber(item.moveN, this.precision.moveN)}</MoveN>
    <MoveH>${this.formatNumber(item.moveH, this.precision.moveH)}</MoveH>
    <MoveTotal>${this.formatNumber(item.moveTotal, this.precision.moveTotal)}</MoveTotal>
    <DayE>${this.formatNumber(item.dayE, this.precision.dayE)}</DayE>
    <DayN>${this.formatNumber(item.dayN, this.precision.dayN)}</DayN>
    <DayH>${this.formatNumber(item.dayH, this.precision.dayH)}</DayH>
  </Record>`;
        });
        xml += '\n</GnssData>';
        return xml;
    }
}
