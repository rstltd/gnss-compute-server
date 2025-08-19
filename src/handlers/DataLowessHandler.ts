
import { GnssModel } from '../models/GnssModel';

export class DataLowessHandler {
    private static readonly BANDWIDTH = 1.0;

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
            const windowList: GnssModel[] = [];
            for (let j = left; j <= i; j++) {
                windowList.push(this.inputGnssModels[j]);
            }
            const pastGnssModels = windowList;
            const resultGnssModel = this.core(this.inputGnssModels[i], pastGnssModels);
            resultGnssModelList.push(resultGnssModel);
        }
        return resultGnssModelList;
    }

    private core(nowGnssModel: GnssModel, pastDataArray: GnssModel[]): GnssModel {
        const windowSize = pastDataArray.length;
        const windowE: number[] = new Array(windowSize);
        const windowN: number[] = new Array(windowSize);
        const windowH: number[] = new Array(windowSize);
        const weightE: number[] = new Array(windowSize);
        const weightN: number[] = new Array(windowSize);
        const weightH: number[] = new Array(windowSize);

        for (let i = 0; i < windowSize; i++) {
            windowE[i] = pastDataArray[i].E;
            windowN[i] = pastDataArray[i].N;
            windowH[i] = pastDataArray[i].H;

            const distanceE = Math.abs(nowGnssModel.E - pastDataArray[i].E);
            const distanceN = Math.abs(nowGnssModel.N - pastDataArray[i].N);
            const distanceH = Math.abs(nowGnssModel.H - pastDataArray[i].H);

            weightE[i] = Math.exp(-Math.pow(distanceE / DataLowessHandler.BANDWIDTH, 2));
            weightN[i] = Math.exp(-Math.pow(distanceN / DataLowessHandler.BANDWIDTH, 2));
            weightH[i] = Math.exp(-Math.pow(distanceH / DataLowessHandler.BANDWIDTH, 2));
        }

        let sumE = 0.0;
        let sumN = 0.0;
        let sumH = 0.0;
        let sumWeightE = 0.0;
        let sumWeightN = 0.0;
        let sumWeightH = 0.0;

        for (let i = 0; i < windowSize; i++) {
            sumE += windowE[i] * weightE[i];
            sumN += windowN[i] * weightN[i];
            sumH += windowH[i] * weightH[i];
            sumWeightE += weightE[i];
            sumWeightN += weightN[i];
            sumWeightH += weightH[i];
        }

        const resultE = sumWeightE === 0 ? nowGnssModel.E : sumE / sumWeightE;
        const resultN = sumWeightN === 0 ? nowGnssModel.N : sumN / sumWeightN;
        const resultH = sumWeightH === 0 ? nowGnssModel.H : sumH / sumWeightH;

        const outputGnssModel: GnssModel = { ...nowGnssModel };
        outputGnssModel.E = resultE;
        outputGnssModel.N = resultN;
        outputGnssModel.H = resultH;

        return outputGnssModel;
    }
}
