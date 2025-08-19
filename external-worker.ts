import express from 'express';
import axios from 'axios';
import cors from 'cors';

// Import GNSS computation modules from TypeScript
import { GnssProcessor } from './src/processors/GnssProcessor';
import { ProcessingOptions } from './src/types/index';

// Configuration interface
interface Config {
    CLOUDFLARE_WORKER_URL: string | undefined;
    EXTERNAL_WORKER_API_KEY: string | undefined;
    WORKER_ID: string;
    POLL_INTERVAL: number;
    MAX_CONCURRENT_JOBS: number;
    PORT: number;
}

// Configuration
const CONFIG: Config = {
    CLOUDFLARE_WORKER_URL: process.env.CLOUDFLARE_WORKER_URL,
    EXTERNAL_WORKER_API_KEY: process.env.EXTERNAL_WORKER_API_KEY,
    WORKER_ID: process.env.WORKER_ID || `compute-server-${Date.now()}`,
    POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '5000'),
    MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
    PORT: parseInt(process.env.PORT || '3001')
};

// Validate required environment variables
if (!CONFIG.CLOUDFLARE_WORKER_URL || !CONFIG.EXTERNAL_WORKER_API_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   CLOUDFLARE_WORKER_URL:', CONFIG.CLOUDFLARE_WORKER_URL ? '✅' : '❌');
    console.error('   EXTERNAL_WORKER_API_KEY:', CONFIG.EXTERNAL_WORKER_API_KEY ? '✅' : '❌');
    process.exit(1);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

let isRunning = true;
let processingJobs = new Set<string>();

// HTTP client for Cloudflare Worker communication
const httpClient = axios.create({
    timeout: 60000, // 1 minute timeout for large computations
    headers: {
        'Authorization': `Bearer ${CONFIG.EXTERNAL_WORKER_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

/**
 * Job data interface
 */
interface JobData {
    jobId: string;
    url: string;
    headers: Record<string, string>;
    fileKey?: string;
    body?: string | ArrayBuffer;
}

/**
 * 服務 1: POS檔案加權平均計算 - 完全獨立的處理流程
 */
async function processPosWeightedAverage(posContent: string): Promise<{ result: string, contentType: string }> {
    console.log(`🔄 [Service 1] Processing POS weighted average - Size: ${posContent.length} bytes`);
    const startTime = Date.now();

    try {
        const result = GnssProcessor.processPosWeightedAverage(posContent);
        const processingDuration = Date.now() - startTime;

        if (result.success) {
            console.log(`✅ [Service 1] POS weighted average completed in ${processingDuration}ms`);
            console.log(`📊 [Service 1] Stats:`, result.stats);
            
            const jsonResult = JSON.stringify({
                success: true,
                result: result.result,
                stats: result.stats
            });
            
            return {
                result: jsonResult,
                contentType: 'application/json'
            };
        } else {
            throw new Error(result.error || 'POS processing failed');
        }
    } catch (error: any) {
        console.error(`❌ [Service 1] POS weighted average failed:`, error.message);
        throw error;
    }
}

/**
 * 服務 2: 標準處理流程 - 支援單一或鏈式處理器（檔案上傳）
 */
async function processHandlerChain(posContent: string, handlerTypes: string[], options: any): Promise<{ result: string, contentType: string }> {
    console.log(`🔄 [Service 2] Processing handler chain - Size: ${posContent.length} bytes, Handlers: [${handlerTypes.join(', ')}]`);
    
    const startTime = Date.now();
    
    try {
        const processingOptions: ProcessingOptions = {
            handlerTypes,
            ...options
        };
        
        const result = await GnssProcessor.processFromPosContent(posContent, processingOptions);
        
        // 數據完整性檢查 - 修正換行符檢查
        const resultSize = Buffer.byteLength(result.result, 'utf8');
        const lineCount = result.result.split('\n').length; // 修正: 使用單個 \n

        const processingDuration = Date.now() - startTime;
        console.log(`✅ [Service 2] Handler chain completed in ${processingDuration}ms`);
        console.log(`📊 [Service 2] Result size: ${resultSize} bytes, Lines: ${lineCount}, Content-Type: ${result.contentType}`);
        
        // 驗證結果不為空
        if (!result.result || result.result.length === 0) {
            throw new Error('Generated result is empty');
        }
        
        // 根據內容類型驗證格式
        if (result.contentType.includes('csv') && !result.result.includes('date_time')) {
            console.warn('⚠️  [Service 2] CSV result missing expected header, but continuing...');
        }
        
        return {
            result: result.result,
            contentType: result.contentType
        };
        
    } catch (error: any) {
        console.error(`❌ [Service 2] Handler chain failed:`, error.message);
        throw error;
    }
}

/**
 * 服務 3: JSON API - 單一處理器（JSON 請求/響應）
 */
async function processJsonRequest(requestData: any): Promise<{ result: string, contentType: string }> {
    console.log(`🔄 [Service 3] Processing JSON request`);
    
    const startTime = Date.now();
    
    try {
        const { handlerType, data, options } = requestData;
        
        const result = await GnssProcessor.processJsonRequest(handlerType, data, options);
        
        const processingDuration = Date.now() - startTime;
        console.log(`✅ [Service 3] JSON request completed in ${processingDuration}ms`);
        
        return {
            result: result.result,
            contentType: result.contentType
        };
        
    } catch (error: any) {
        console.error(`❌ [Service 3] JSON request failed:`, error.message);
        throw error;
    }
}

/**
 * Pull task from Cloudflare Worker
 */
async function pullTask(): Promise<JobData | null> {
    try {
        const response = await httpClient.get(`${CONFIG.CLOUDFLARE_WORKER_URL}/api/external/pull-task`);
        
        if (response.status === 200 && response.data.jobId) {
            return response.data as JobData;
        }
        return null;
    } catch (error: any) {
        if (error.response?.status !== 404) {
            console.error('❌ Pull task error:', error.message);
        }
        return null;
    }
}

/**
 * Submit computation result back to Cloudflare Worker
 */
async function submitResult(jobId: string, result: string | null, error: string | null = null, contentType: string = 'text/csv; charset=utf-8'): Promise<void> {
    try {
        const payload = {
            jobId,
            result,
            error,
            contentType,
            workerId: CONFIG.WORKER_ID,
            timestamp: Date.now()
        };
        
        // 記錄提交的數據大小
        if (result) {
            const resultSize = Buffer.byteLength(result, 'utf8');
            console.log(`📤 Submitting result for job ${jobId}: ${resultSize} bytes`);
            (payload as any).resultSize = resultSize;
        }
        
        await httpClient.post(`${CONFIG.CLOUDFLARE_WORKER_URL}/api/external/submit-result`, payload);
        console.log(`✅ Result submitted for job ${jobId}`);
    } catch (error: any) {
        console.error(`❌ Failed to submit result for job ${jobId}:`, error.message);
        throw error;
    }
}

/**
 * Process individual job with proper service separation
 */
async function processJob(job: JobData): Promise<void> {
    const { jobId, url, headers, fileKey, body } = job;
    
    processingJobs.add(jobId);
    console.log(`🚀 Starting job ${jobId} - Active jobs: ${processingJobs.size}`);
    
    try {
        // Parse URL parameters
        const urlObj = new URL(url);
        const handlerTypeFromUrl = urlObj.searchParams.get('handlerType');
        const options: Record<string, any> = {};
        
        for (const [key, value] of urlObj.searchParams.entries()) {
            if (key !== 'handlerType') {
                options[key] = value;
            }
        }
        
        // Get content based on job type
        let content: string | any = '';
        if (fileKey) {
            console.log(`📁 Job ${jobId} contains large file: ${fileKey}`);
            // TODO: Implement R2 file retrieval if needed
            content = 'large file content placeholder';
        } else if (body) {
            if (typeof body === 'string') {
                content = body;
            } else {
                content = new TextDecoder().decode(body as ArrayBuffer);
            }
        }
        
        let processResult: { result: string, contentType: string };
        
        // 🎯 服務區隔決策邏輯
        if (handlerTypeFromUrl === 'posWeightedAverage') {
            // 服務 1: POS檔案加權平均計算 - 完全獨立的處理流程
            console.log(`🎯 [Job ${jobId}] Routing to Service 1: POS weighted average`);
            processResult = await processPosWeightedAverage(content as string);
            
        } else if (handlerTypeFromUrl && content && typeof content === 'string') {
            // 服務 2: 標準處理流程 - 支援單一或鏈式處理器（檔案上傳）
            const handlerTypes = handlerTypeFromUrl.split(',').map(h => h.trim()).filter(h => h);
            console.log(`🎯 [Job ${jobId}] Routing to Service 2: Handler chain [${handlerTypes.join(', ')}]`);
            processResult = await processHandlerChain(content, handlerTypes, options);
            
        } else if (!handlerTypeFromUrl && body) {
            // 服務 3: JSON API - 單一處理器（JSON 請求/響應）
            console.log(`🎯 [Job ${jobId}] Routing to Service 3: JSON API`);
            let requestData;
            if (typeof body === 'string') {
                try {
                    requestData = JSON.parse(body);
                } catch {
                    throw new Error('Invalid JSON in request body');
                }
            } else {
                requestData = JSON.parse(new TextDecoder().decode(body as ArrayBuffer));
            }
            processResult = await processJsonRequest(requestData);
            
        } else {
            throw new Error(`Unknown job type - handlerType: ${handlerTypeFromUrl}, hasBody: ${!!body}, bodyType: ${typeof body}`);
        }
        
        // Submit result with proper content type
        await submitResult(jobId, processResult.result, null, processResult.contentType);
        
    } catch (error: any) {
        console.error(`❌ Job ${jobId} failed:`, error.message);
        await submitResult(jobId, null, error.message);
    } finally {
        processingJobs.delete(jobId);
        console.log(`✅ Job ${jobId} completed - Remaining: ${processingJobs.size}`);
    }
}

/**
 * Main polling loop
 */
async function mainLoop(): Promise<void> {
    console.log(`🚀 GNSS Compute Server started (TypeScript - Service Separated)`);
    console.log(`   Worker ID: ${CONFIG.WORKER_ID}`);
    console.log(`   Polling interval: ${CONFIG.POLL_INTERVAL}ms`);
    console.log(`   Max concurrent jobs: ${CONFIG.MAX_CONCURRENT_JOBS}`);
    console.log(`   Cloudflare Worker URL: ${CONFIG.CLOUDFLARE_WORKER_URL}`);
    console.log(`   📋 Services available:`);
    console.log(`      1. POS weighted average (posWeightedAverage)`);
    console.log(`      2. Handler chain (file upload + handlerType)`);
    console.log(`      3. JSON API (single processor)`);
    
    while (isRunning) {
        try {
            // Check concurrency limit
            if (processingJobs.size >= CONFIG.MAX_CONCURRENT_JOBS) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
                continue;
            }
            
            // Pull next task
            const job = await pullTask();
            
            if (job) {
                // Process job asynchronously
                processJob(job).catch(error => {
                    console.error('❌ Job processing error:', error);
                });
                // Continue immediately to check for more tasks
                continue;
            } else {
                // No tasks available, wait before next poll
                await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
            }
            
        } catch (error: any) {
            console.error('❌ Main loop error:', error);
            await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
        }
    }
    
    console.log('🛑 GNSS Compute Server stopped');
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        workerId: CONFIG.WORKER_ID,
        activeJobs: processingJobs.size,
        maxConcurrentJobs: CONFIG.MAX_CONCURRENT_JOBS,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: Date.now(),
        services: [
            'POS weighted average (posWeightedAverage)',
            'Handler chain (file upload + handlerType)',
            'JSON API (single processor)'
        ]
    });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
    res.json({
        activeJobs: Array.from(processingJobs),
        totalProcessed: 0, // TODO: Add counter
        avgProcessingTime: 0, // TODO: Add metrics
        systemLoad: process.cpuUsage(),
        memoryUsage: process.memoryUsage()
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received shutdown signal, shutting down gracefully...');
    isRunning = false;
    
    const checkInterval = setInterval(() => {
        if (processingJobs.size === 0) {
            clearInterval(checkInterval);
            console.log('✅ All jobs completed, exiting');
            process.exit(0);
        } else {
            console.log(`⏳ Waiting for ${processingJobs.size} jobs to complete...`);
        }
    }, 1000);
    
    // Force exit after 60 seconds
    setTimeout(() => {
        console.log('⚠️  Forced shutdown after 60 seconds');
        process.exit(1);
    }, 60000);
});

process.on('SIGINT', () => {
    console.log('🛑 Received interrupt signal (Ctrl+C)');
    process.emit('SIGTERM');
});

// Start HTTP server and main loop
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 HTTP server running on port ${CONFIG.PORT}`);
    console.log(`   Health check: http://localhost:${CONFIG.PORT}/health`);
    console.log(`   Metrics: http://localhost:${CONFIG.PORT}/metrics`);
    
    // Start main polling loop
    mainLoop().catch(error => {
        console.error('❌ Main loop failed to start:', error);
        process.exit(1);
    });
});