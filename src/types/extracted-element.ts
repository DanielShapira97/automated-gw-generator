export type ProcessingRoute = 'docx' | 'pdf_native' | 'pdf_ocr'

export type ExtractedElement = {
  text: string
  fontSize?: number
  fontName?: string
  yPos?: number
  isBold?: boolean
  style?: string
  paraIndex?: number
}
