
import { GnssModel } from './GnssModel';

export class SwcaCalculateHandler {
    private readonly inputGnssModels: GnssModel[];

    constructor(inputGnssModels: GnssModel[]) {
        this.inputGnssModels = inputGnssModels;
    }

    public calculateSwca(): GnssModel[] {
        const resultGnssModelList: GnssModel[] = [];
        const n = this.inputGnssModels.length;
        if (n === 0) return [];
        const firstGnssModel = this.inputGnssModels[0];

        let left = 0;
        for (let i = 0; i < n; i++) {
            const nowGnssModel = this.inputGnssModels[i];
            const nowTime = new Date(nowGnssModel.dateTime);
            const windowStartTime = new Date(nowTime.getTime() - 24 * 60 * 60 * 1000); // 24h ago
            
            // Move left pointer to window start (same as Java version)
            while (left < n && new Date(this.inputGnssModels[left].dateTime) < windowStartTime) {
                left++;
            }
            
            // Find past24hrGnssModel (closest to windowStart, or same as nowGnssModel if left==i)
            const past24hrGnssModel = (left < n) ? this.inputGnssModels[left] : this.inputGnssModels[0];

            // Calculate 24-hour displacement (moveE, moveN, moveH in Java version)
            const moveE = (nowGnssModel.E - past24hrGnssModel.E) * 1000.0;
            const moveN = (nowGnssModel.N - past24hrGnssModel.N) * 1000.0;
            const moveH = (nowGnssModel.H - past24hrGnssModel.H) * 1000.0;
            const angle = (Math.toDegrees(Math.atan2(moveN, moveE)) + 360) % 360;
            const axis = Math.sqrt(moveE * moveE + moveN * moveN + moveH * moveH);
            const plate = Math.sqrt(moveE * moveE + moveN * moveN);

            // Calculate total displacement from first point (moveETotal, etc. in Java version)
            const moveETotal = (nowGnssModel.E - firstGnssModel.E) * 1000.0;
            const moveNTotal = (nowGnssModel.N - firstGnssModel.N) * 1000.0;
            const moveHTotal = (nowGnssModel.H - firstGnssModel.H) * 1000.0;
            const moveTotal = Math.sqrt(moveETotal * moveETotal + moveNTotal * moveNTotal + moveHTotal * moveHTotal);

            // Calculate 24hr average (recalculate sum for each window, same as Java version)
            const len = i - left + 1;
            let sumDayE = 0.0;
            let sumDayN = 0.0;
            let sumDayH = 0.0;
            for (let j = left; j <= i; j++) {
                sumDayE += this.inputGnssModels[j].E;
                sumDayN += this.inputGnssModels[j].N;
                sumDayH += this.inputGnssModels[j].H;
            }
            const dayE = len > 0 ? sumDayE / len : nowGnssModel.E;
            const dayN = len > 0 ? sumDayN / len : nowGnssModel.N;
            const dayH = len > 0 ? sumDayH / len : nowGnssModel.H;

            const outputGnssModel: GnssModel = { ...nowGnssModel };
            outputGnssModel.angle = angle;
            outputGnssModel.axis = axis;
            outputGnssModel.plate = plate;
            outputGnssModel.moveE = moveETotal;
            outputGnssModel.moveN = moveNTotal;
            outputGnssModel.moveH = moveHTotal;
            outputGnssModel.moveTotal = moveTotal;
            outputGnssModel.dayE = dayE;
            outputGnssModel.dayN = dayN;
            outputGnssModel.dayH = dayH;

            resultGnssModelList.push(outputGnssModel);
        }
        return resultGnssModelList;
    }
}

// Extend Math object with toRadians and toDegrees if they don't exist
declare global {
    interface Math {
        toRadians(degrees: number): number;
        toDegrees(radians: number): number;
    }
}

if (typeof Math.toRadians === 'undefined') {
    Math.toRadians = (degrees: number): number => {
        return degrees * (Math.PI / 180);
    };
}

if (typeof Math.toDegrees === 'undefined') {
    Math.toDegrees = (radians: number): number => {
        return radians * (180 / Math.PI);
    };
}
