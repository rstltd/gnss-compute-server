
import { GnssModel } from './GnssModel';

export class DataAverageHandler {
    private models: GnssModel[];

    constructor(models: GnssModel[]) {
        this.models = models;
    }

    calculate(): GnssModel[] {
        if (this.models.length === 0) {
            return [];
        }

        const grouped = new Map<number, GnssModel[]>();

        for (const model of this.models) {
            const timestamp = new Date(model.dateTime).getTime();
            const interval = Math.floor(timestamp / (10 * 60 * 1000)); // 10-minute intervals
            if (!grouped.has(interval)) {
                grouped.set(interval, []);
            }
            grouped.get(interval)!.push(model);
        }

        const averagedData: GnssModel[] = [];
        for (const [interval, group] of grouped.entries()) {
            const avgE = group.reduce((sum, m) => sum + m.E, 0) / group.length;
            const avgN = group.reduce((sum, m) => sum + m.N, 0) / group.length;
            const avgH = group.reduce((sum, m) => sum + m.H, 0) / group.length;

            const intervalStart = new Date(interval * 10 * 60 * 1000);

            averagedData.push({
                ...group[0], // Preserve other properties from the first model in the group
                dateTime: intervalStart.toISOString(),
                E: avgE,
                N: avgN,
                H: avgH,
            });
        }

        // Sort by dateTime ascending
        return averagedData.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    }
}
