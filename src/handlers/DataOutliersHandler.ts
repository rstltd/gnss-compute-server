
import { GnssModel } from '../models/GnssModel';

export class DataOutliersHandler {
    private static readonly K = 1.5;

    private readonly inputGnssModels: GnssModel[];

    constructor(inputGnssModels: GnssModel[]) {
        this.inputGnssModels = inputGnssModels;
    }

    public calculate(windowSize: number): GnssModel[] {
        const resultGnssModelList: GnssModel[] = [];
        const n = this.inputGnssModels.length;
        if (n === 0) return [];

        for (let i = 0; i < n; i++) {
            const left = Math.max(0, i - windowSize + 1);
            const len = i - left + 1;
            const nowGnssModel = this.inputGnssModels[i];

            if (len < 4) {
                resultGnssModelList.push({ ...nowGnssModel });
                continue;
            }

            const e: number[] = [];
            const nArr: number[] = [];
            const h: number[] = [];

            for (let j = 0; j < len; j++) {
                e.push(this.inputGnssModels[left + j].E);
                nArr.push(this.inputGnssModels[left + j].N);
                h.push(this.inputGnssModels[left + j].H);
            }

            const eBounds = this.calculateBounds(e);
            const nBounds = this.calculateBounds(nArr);
            const hBounds = this.calculateBounds(h);

            let lastE = nowGnssModel.E;
            let lastN = nowGnssModel.N;
            let lastH = nowGnssModel.H;

            if (lastE < eBounds[0]) lastE = eBounds[0];
            if (lastE > eBounds[1]) lastE = eBounds[1];
            if (lastN < nBounds[0]) lastN = nBounds[0];
            if (lastN > nBounds[1]) lastN = nBounds[1];
            if (lastH < hBounds[0]) lastH = hBounds[0];
            if (lastH > hBounds[1]) lastH = hBounds[1];

            const outputGnssModel: GnssModel = { ...nowGnssModel };
            outputGnssModel.E = lastE;
            outputGnssModel.N = lastN;
            outputGnssModel.H = lastH;

            resultGnssModelList.push(outputGnssModel);
        }
        return resultGnssModelList;
    }

    private calculateBounds(values: number[]): [number, number] {
        values.sort((a, b) => a - b);
        const q1 = this.percentile(values, 25);
        const q3 = this.percentile(values, 75);
        const iqr = q3 - q1;
        const lowerFence = q1 - DataOutliersHandler.K * iqr;
        const upperFence = q3 + DataOutliersHandler.K * iqr;
        return [lowerFence, upperFence];
    }

    private percentile(values: number[], percentile: number): number {
        if (values.length === 0) return NaN;
        if (percentile <= 0) return values[0];
        if (percentile >= 100) return values[values.length - 1];

        const index = percentile / 100.0 * (values.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return values[lower];

        const fraction = index - lower;
        return values[lower] * (1 - fraction) + values[upper] * fraction;
    }
}
