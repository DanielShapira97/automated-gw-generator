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
    const htmlResult = await mammoth.convertToHtml({ path: docxPath })
    const html = htmlResult.value ?? ''
    const blocks = html.match(/<table[\s\S]*?<\/table>|<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>/gi) ?? []
    const elements: ExtractedElement[] = []
    let paraIndex = 0

    for (const block of blocks) {
      if (block.toLowerCase().startsWith('<table')) {
        const drawnTable = this.drawTableFromHtml(block)
        if (drawnTable) {
          elements.push({
            text: drawnTable,
            fontSize: 12,
            isBold: false,
            style: 'Table',
            paraIndex
          })
          paraIndex += 1
        }
        continue
      }

      const text = this.sanitizeText(this.extractTextFromHtml(block))
      if (!text) {
        continue
      }
      elements.push({
        text,
        fontSize: 12,
        isBold: false,
        style: 'Normal',
        paraIndex
      })
      paraIndex += 1
    }

    this.logger.log(`Extracted ${elements.length} DOCX blocks (paragraphs + tables).`)
    return elements
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

  private drawTableFromHtml(tableHtml: string): string {
    const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
    const parsedRows = rows
      .map((rowXml) => {
        const cells = rowXml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []
        return cells.map((cellXml) => this.sanitizeText(this.extractTextFromHtml(cellXml)).replace(/\|/g, '\\|').trim())
      })
      .filter((row) => row.some((cell) => cell.length > 0))

    if (!parsedRows.length) {
      return ''
    }

    const colCount = Math.max(...parsedRows.map((row) => row.length))
    const normalizedRows = parsedRows.map((row) => {
      const padded = [...row]
      while (padded.length < colCount) {
        padded.push('')
      }
      return padded
    })

    const header = `| ${normalizedRows[0].join(' | ')} |`
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`
    const body = normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`)

    return [header, separator, ...body].join('\n')
  }

  private extractTextFromHtml(html: string): string {
    const withNewlines = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
    const withoutTags = withNewlines.replace(/<[^>]+>/g, ' ')
    return this.decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim()
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  }

  private sanitizeText(value: string): string {
    return value
      .replace(/<\/?w:[^>]*>/gi, ' ')
      .replace(/<\?xml[^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
