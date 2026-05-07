import { Injectable, Logger } from '@nestjs/common'
import AdmZip from 'adm-zip'
import * as fs from 'fs'
import * as path from 'path'
import mammoth from 'mammoth'
import { ExtractedElement } from '../../types/extracted-element'

@Injectable()
export class DocxProcessorService {
  private readonly logger = new Logger(DocxProcessorService.name)

  async extractTextWithMetadata(docxPath: string): Promise<ExtractedElement[]> {
    this.logger.log(`Starting DOCX extraction for: ${docxPath}`)
    const raw = await mammoth.extractRawText({ path: docxPath })
    const lines = raw.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    return lines.map((line, i) => ({
      text: line,
      fontSize: 12,
      isBold: false,
      style: 'Normal',
      paraIndex: i
    }))
  }

  extractImages(docxPath: string, outputFolder: string): number {
    this.logger.log('Extracting DOCX images...')
    const zip = new AdmZip(docxPath)
    const entries = zip.getEntries().filter((entry) => entry.entryName.startsWith('word/media/'))
    let imageCount = 0

    for (const entry of entries) {
      const ext = path.extname(entry.entryName) || '.bin'
      imageCount += 1
      const out = path.join(outputFolder, `docx_img_${imageCount}${ext}`)
      fs.writeFileSync(out, entry.getData())
    }

    this.logger.log(`Extracted ${imageCount} images from DOCX.`)
    return imageCount
  }
}
