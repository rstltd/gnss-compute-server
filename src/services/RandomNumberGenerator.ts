/**
 * RandomNumberGenerator - 負責種子隨機數生成
 * 單一職責：提供確定性的隨機數生成功能
 */
export class RandomNumberGenerator {
    private random: () => number;
    
    constructor(seed: number = 42) {
        this.random = this.seededRandom(seed);
    }
    
    /**
     * 重置隨機數種子
     */
    public resetSeed(seed: number): void {
        this.random = this.seededRandom(seed);
    }
    
    /**
     * 獲取 0-1 之間的隨機數
     */
    public next(): number {
        return this.random();
    }
    
    /**
     * 生成高斯分佈隨機數（Box-Muller transform）
     */
    public gaussianRandom(): number {
        const u = 1 - this.random();
        const v = this.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    
    /**
     * 線性同餘隨機數生成器
     */
    private seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            state = (state * 1664525 + 1013904223) % 0x100000000;
            return state / 0x100000000;
        };
    }
}
