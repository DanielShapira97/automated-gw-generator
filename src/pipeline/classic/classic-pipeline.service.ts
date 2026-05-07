import { Inject, Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { APP_CONFIG, AppConfig } from '../../config/app-config'
import { ExtractedElement } from '../../types/extracted-element'
import { BlockBuilderService } from './block-builder.service'
import { DocxProcessorService } from './docx-processor.service'
import { DocumentRouterService } from './document-router.service'
import { OcrProcessorService } from './ocr-processor.service'
import { PdfNativeProcessorService } from './pdf-native-processor.service'

@Injectable()
export class ClassicPipelineService {
  private readonly logger = new Logger(ClassicPipelineService.name)

  constructor(
    private readonly router: DocumentRouterService,
    private readonly blockBuilder: BlockBuilderService,
    private readonly docxProcessor: DocxProcessorService,
    private readonly pdfProcessor: PdfNativeProcessorService,
    private readonly ocrProcessor: OcrProcessorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async processDocument(filePath: string): Promise<string> {
    const fileName = path.basename(filePath)
    const docName = path.parse(fileName).name
    const docOutputDir = path.join(this.config.outputBaseDir, docName)
    fs.mkdirSync(docOutputDir, { recursive: true })

    this.logger.log(`Processing started: ${fileName}`)
    const route = await this.router.getProcessingRoute(filePath)
    if (!route) {
      throw new Error(`Could not determine route for ${fileName}`)
    }

    let elements: ExtractedElement[] = []
    if (route === 'docx') {
      elements = await this.docxProcessor.extractTextWithMetadata(filePath)
      this.docxProcessor.extractImages(filePath, docOutputDir)
    } else if (route === 'pdf_native') {
      elements = await this.pdfProcessor.extractTextWithMetadata(filePath)
      this.pdfProcessor.extractImages(filePath, docOutputDir)
    } else {
      elements = await this.ocrProcessor.extractTextWithMetadata(filePath, docOutputDir)
    }

    if (!elements.length) {
      throw new Error(`No text extracted for ${fileName}`)
    }

    const finalContent = this.blockBuilder.segmentElements(elements)
    const gtPath = path.join(docOutputDir, `${docName}_ground_truth.txt`)
    fs.writeFileSync(gtPath, finalContent, 'utf-8')
    return gtPath
  }
}
