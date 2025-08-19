
import { GnssModel } from './GnssModel';

export class DataMedianHandler {
    private readonly inputGnssModels: GnssModel[];

    constructor(inputGnssModels: GnssModel[]) {
        this.inputGnssModels = inputGnssModels;
    }

    public calculate(windowSize: number): GnssModel[] {
        const n = this.inputGnssModels.length;
        if (n === 0) return [];
        const resultGnssModelList: GnssModel[] = [];

        for (let i = 0; i < n; i++) {
            const left = Math.max(0, i - windowSize + 1);
            const eList: number[] = [];
            const nList: number[] = [];
            const hList: number[] = [];

            for (let j = left; j <= i; j++) {
                eList.push(this.inputGnssModels[j].E);
                nList.push(this.inputGnssModels[j].N);
                hList.push(this.inputGnssModels[j].H);
            }

            const medianE = this.getMedianFromList(eList);
            const medianN = this.getMedianFromList(nList);
            const medianH = this.getMedianFromList(hList);

            const outputGnssModel: GnssModel = { ...this.inputGnssModels[i] };
            outputGnssModel.E = medianE;
            outputGnssModel.N = medianN;
            outputGnssModel.H = medianH;
            resultGnssModelList.push(outputGnssModel);
        }
        return resultGnssModelList;
    }

    private getMedianFromList(list: number[]): number {
        const size = list.length;
        if (size === 0) return 0.0;
        list.sort((a, b) => a - b);
        if (size % 2 === 1) {
            return list[Math.floor(size / 2)];
        } else {
            return (list[size / 2 - 1] + list[size / 2]) / 2.0;
        }
    }
}
