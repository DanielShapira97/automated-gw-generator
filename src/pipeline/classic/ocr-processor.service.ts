import { Injectable, Logger } from '@nestjs/common'
import { ExtractedElement } from '../../types/extracted-element'

@Injectable()
export class OcrProcessorService {
  private readonly logger = new Logger(OcrProcessorService.name)

  async extractTextWithMetadata(filePath: string, _tempFolder: string): Promise<ExtractedElement[]> {
    this.logger.warn(`OCR path not implemented in this NestJS migration for file: ${filePath}`)
    return []
  }
}
