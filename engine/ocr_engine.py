import os
from paddleocr import PaddleOCR
from utils.logger import setup_logger
from pdf2image import convert_from_path

logger = setup_logger("OCREngine")

class OcrProcessor:
    """
    Handles scanned PDFs and images using local PaddleOCR.
    """
    def __init__(self, lang='en'):
        # Initializing PaddleOCR (downloads models on first run)
        self.ocr = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    def extract_text_with_metadata(self, file_path, temp_folder):
        """
        Converts PDF pages to images and performs OCR.
        """
        logger.info(f"Starting OCR extraction for: {file_path}")
        full_content = []
        
        try:
            # 1. Convert PDF pages to images
            images = convert_from_path(file_path)
            
            for i, img in enumerate(images):
                logger.info(f"OCR processing page {i+1}...")
                # Save temp image for Paddle to read
                img_path = os.path.join(temp_folder, f"temp_page_{i+1}.jpg")
                img.save(img_path, "JPEG")
                
                # 2. Run OCR
                result = self.ocr.ocr(img_path, cls=True)
                
                # 3. Format result to match our metadata structure
                for line in result[0]:
                    coords = line[0]  # [top-left, top-right, bottom-right, bottom-left]
                    text = line[1][0]
                    confidence = line[1][1]
                    
                    metadata = {
                        "text": text,
                        "font_size": 12,  # OCR doesn't always give exact font size
                        "y_pos": coords[0][1], # Y coordinate of top-left corner
                        "is_bold": False
                    }
                    full_content.append(metadata)
                
                # Optional: keep the page image as part of the extracted images
                os.rename(img_path, os.path.join(temp_folder, f"page_{i+1}.jpg"))

            return full_content
        except Exception as e:
            logger.error(f"OCR processing failed: {e}", exc_info=True)
            return []