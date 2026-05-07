import { Injectable, Logger } from '@nestjs/common'
import { ExtractedElement } from '../../types/extracted-element'

@Injectable()
export class BlockBuilderService {
  private readonly logger = new Logger(BlockBuilderService.name)
  private readonly fontSizeThreshold = 12.0
  private readonly yDistanceThreshold = 150.0

  constructor() {}

  segmentElements(elements: ExtractedElement[]): string {
    if (!elements.length) {
      this.logger.warn('No elements provided for segmentation.')
      return ''
    }

    const blocks: string[] = []
    let currentBlockText: string[] = []
    let lastFontSize = elements[0].fontSize ?? 12
    let lastYPos = elements[0].yPos
    let lastStyle = elements[0].style

    for (const el of elements) {
      const text = (el.text ?? '').trim()
      if (!text) {
        continue
      }

      const currentFontSize = el.fontSize ?? 12
      const currentYPos = el.yPos
      const currentStyle = el.style

      const fontChanged = Math.abs(currentFontSize - lastFontSize) > this.fontSizeThreshold
      const gapDetected =
        currentYPos !== undefined && lastYPos !== undefined ? currentYPos - lastYPos > this.yDistanceThreshold : false
      const styleChanged = currentStyle !== lastStyle

      if ((fontChanged || gapDetected || styleChanged) && currentBlockText.length) {
        blocks.push(this.formatBlock(currentBlockText))
        currentBlockText = []
      }

      currentBlockText.push(text)
      lastFontSize = currentFontSize
      lastYPos = currentYPos
      lastStyle = currentStyle
    }

    if (currentBlockText.length) {
      blocks.push(this.formatBlock(currentBlockText))
    }

    if (!blocks.length) {
      return ''
    }

    const mergedBlocks: string[] = []
    let currentMerged = blocks[0]
    for (let i = 1; i < blocks.length; i += 1) {
      const nextBlock = blocks[i]
      const cleanCurrent = currentMerged.replace(/====/g, '').trim()
      if (cleanCurrent.length < 60) {
        currentMerged = this.formatBlock([`${cleanCurrent} ${nextBlock.replace(/====/g, '').trim()}`.trim()])
      } else {
        mergedBlocks.push(currentMerged)
        currentMerged = nextBlock
      }
    }
    mergedBlocks.push(currentMerged)
    return mergedBlocks.join('\n\n')
  }

  private formatBlock(textList: string[]): string {
    return `====\n${textList.join('\n')}\n====`
  }
}
