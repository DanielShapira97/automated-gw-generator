import { Inject, Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { APP_CONFIG, AppConfig } from '../../config/app-config'
import { CompletionServiceClient } from '../../completion/completion-service.client'
import { DocxProcessorService } from '../classic/docx-processor.service'
import { PdfNativeProcessorService } from '../classic/pdf-native-processor.service'

const BLOCK_PROMPT = `Divide the text into LARGE logical blocks using ==== markers.
1. DO NOT DELETE ANY TEXT. NO SUMMARIZING.
2. NO MARKDOWN symbols except for tables using | and -.
3. Every block must start and end with ====.
4. Return ONLY the blocks.

Text:

`

@Injectable()
export class GatewayLlmPipelineService {
  constructor(
    private readonly completionClient: CompletionServiceClient,
    private readonly docxProcessor: DocxProcessorService,
    private readonly pdfProcessor: PdfNativeProcessorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async processDocument(filePath: string): Promise<string> {
    const docName = path.parse(path.basename(filePath)).name
    const docOutputDir = path.join(this.config.outputBaseDir, docName)
    fs.mkdirSync(docOutputDir, { recursive: true })

    const ext = path.extname(filePath).toLowerCase()
    const rawText = await this.getRawText(filePath, ext)
    const finalGt = await this.structureIntoBlocks(rawText)

    const outPath = path.join(docOutputDir, `${docName} ground truth.txt`)
    fs.writeFileSync(outPath, finalGt, 'utf-8')
    return outPath
  }

  private async getRawText(filePath: string, ext: string): Promise<string> {
    if (ext === '.docx') {
      const elements = await this.docxProcessor.extractTextWithMetadata(filePath)
      return elements.map((e) => e.text).join('\n')
    }

    if (ext === '.pdf') {
      const spans = await this.pdfProcessor.extractTextWithMetadata(filePath)
      return spans.map((s) => s.text).join(' ')
    }

    throw new Error(`Unsupported input format: ${ext}`)
  }

  private async structureIntoBlocks(rawText: string): Promise<string> {
    if (!rawText.trim()) {
      return 'Error: No text extracted.'
    }
    const prompt = `${BLOCK_PROMPT}${rawText}`
    return this.completionClient.generateAnswer(prompt, this.config.completionModel, { allowFallback: false })
  }
}
