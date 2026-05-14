import * as dotenv from 'dotenv'

dotenv.config()

export type AppConfig = {
  nodeEnv: string
  port: number
  outputBaseDir: string
  uploadsDir: string
  completionBaseUrl: string
  completionModel: string
  completionFallbackEnabled: boolean
}

export const APP_CONFIG = Symbol('APP_CONFIG')

export const appConfig: AppConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8000),
  outputBaseDir: process.env.OUTPUT_FOLDER ?? 'evaluation_results',
  uploadsDir: process.env.UPLOAD_DIR ?? 'uploads',
  completionBaseUrl: process.env.COMPLETIONS_API_URL ?? 'https://completion-service.stg.jeenai.app',
  completionModel: process.env.COMPLETIONS_MODEL ?? 'gpt-4o',
  completionFallbackEnabled: (process.env.COMPLETION_FALLBACK_ENABLED ?? 'true').toLowerCase() === 'true'
}
