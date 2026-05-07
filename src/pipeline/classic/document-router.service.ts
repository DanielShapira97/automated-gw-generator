import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { ProcessingRoute } from '../../types/extracted-element'
import { PdfNativeProcessorService } from './pdf-native-processor.service'

@Injectable()
export class DocumentRouterService {
  private readonly logger = new Logger(DocumentRouterService.name)

  constructor(private readonly pdfNativeProcessor: PdfNativeProcessorService) {}

  async getProcessingRoute(filePath: string): Promise<ProcessingRoute | null> {
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`)
      return null
    }

    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.docx') {
      return 'docx'
    }
    if (ext === '.pdf') {
      const isDigital = await this.isPdfDigital(filePath)
      return isDigital ? 'pdf_native' : 'pdf_ocr'
    }
    this.logger.error(`Unsupported file format: ${ext}`)
    return null
  }

  private async isPdfDigital(pdfPath: string): Promise<boolean> {
    const spans = await this.pdfNativeProcessor.extractTextWithMetadata(pdfPath)
    return spans.some((span) => span.text.trim().length > 0)
  }
}
