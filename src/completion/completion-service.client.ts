import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common'
import { AxiosError } from 'axios'
import { firstValueFrom } from 'rxjs'
import { APP_CONFIG, type AppConfig } from '../config/app-config'

type CompletionServiceMessage = {
  type: 'message'
  role: 'system' | 'user'
  content: Array<{ type: 'text'; text: string }>
}

@Injectable()
export class CompletionServiceClient {
  private readonly logger = new Logger(CompletionServiceClient.name)

  constructor(
    private readonly http: HttpService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async generateAnswer(prompt: string, modelId: string, options?: { allowFallback?: boolean }): Promise<string> {
    const allowFallback = options?.allowFallback ?? true
    const completionUrl = this.buildCompletionUrl()
    const messages = this.buildCompletionMessages(prompt)

    try {
      const response = await firstValueFrom(
        this.http.post<{ outputText: string }>(completionUrl, {
          model: modelId,
          stream: false,
          messages
        })
      )

      const output = response.data?.outputText
      if (typeof output !== 'string' || !output.trim()) {
        if (allowFallback && this.shouldUseFallback()) {
          this.logger.warn(`Using local fallback because completion service returned invalid output for model "${modelId}"`)
          return this.buildFallbackOutput(prompt)
        }
        throw new BadGatewayException(`Completion service returned invalid output for model "${modelId}"`)
      }

      return output
    } catch (err) {
      if (err instanceof BadGatewayException) {
        if (allowFallback && this.shouldUseFallback()) {
          this.logger.warn(`Using local fallback after completion service bad-gateway error: ${err.message}`)
          return this.buildFallbackOutput(prompt)
        }
        throw err
      }

      if (err instanceof AxiosError) {
        const status = err.response?.status
        const responseData: unknown = err.response?.data as unknown
        const body =
          responseData === undefined
            ? ''
            : ` body=${typeof responseData === 'string' ? responseData : JSON.stringify(responseData)}`
        const code = err.code ? ` code=${err.code}` : ''
        const rawMessage = err.message?.trim() || 'No transport error message'

        if (!status) {
          if (allowFallback && this.shouldUseFallback()) {
            this.logger.warn(`Using local fallback because completion service is unreachable at ${completionUrl}`)
            return this.buildFallbackOutput(prompt)
          }
          throw new BadGatewayException(`Completion service is unreachable at ${completionUrl}.${code} ${rawMessage}`)
        }

        if (allowFallback && this.shouldUseFallback()) {
          this.logger.warn(`Using local fallback after completion service status ${status} from ${completionUrl}`)
          return this.buildFallbackOutput(prompt)
        }

        throw new BadGatewayException(
          `Completion service call failed for model "${modelId}" at ${completionUrl} (status ${status}).${code} ${rawMessage}${body}`
        )
      }

      throw err
    }
  }

  private shouldUseFallback(): boolean {
    return this.config.completionFallbackEnabled && this.config.nodeEnv !== 'production'
  }

  private buildCompletionUrl(): string {
    const normalizedBase = this.config.completionBaseUrl.trim().replace(/\/+$/, '')
    if (normalizedBase.endsWith('/api/v1/completions')) {
      return normalizedBase
    }
    if (normalizedBase.endsWith('/api/v1')) {
      return `${normalizedBase}/completions`
    }
    return `${normalizedBase}/api/v1/completions`
  }

  private buildCompletionMessages(prompt: string): CompletionServiceMessage[] {
    const rolePrompt = this.extractLeadingRolePrompt(prompt)
    if (!rolePrompt) {
      return [this.buildTextMessage('user', prompt)]
    }
    return [this.buildTextMessage('system', rolePrompt.roleInstruction), this.buildTextMessage('user', rolePrompt.userPrompt)]
  }

  private extractLeadingRolePrompt(prompt: string): { roleInstruction: string; userPrompt: string } | null {
    const match = prompt.match(/^### ROLE\s*\r?\n([\s\S]*?)\r?\n\r?\n(### DATA INPUTS[\s\S]*)$/)
    const roleInstruction = match?.[1]?.trim()
    const userPrompt = match?.[2]?.trimStart()
    if (!roleInstruction || !userPrompt) {
      return null
    }
    return { roleInstruction, userPrompt }
  }

  private buildTextMessage(role: CompletionServiceMessage['role'], text: string): CompletionServiceMessage {
    return {
      type: 'message',
      role,
      content: [{ type: 'text', text }]
    }
  }

  private buildFallbackOutput(prompt: string): string {
    return JSON.stringify({ question: 'Fallback output', answer: prompt.slice(0, 480) })
  }
}
