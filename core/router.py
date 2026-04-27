import os
import fitz  # PyMuPDF
from utils.logger import setup_logger

logger = setup_logger("Router")

class DocumentRouter:
    """
    Analyzes documents and determines the most efficient processing path.
    """

    @staticmethod
    def is_pdf_digital(pdf_path):
        """
        Checks if a PDF has a searchable text layer.
        """
        try:
            doc = fitz.open(pdf_path)
            for page in doc:
                # If even one page contains text, we treat it as a digital PDF
                if page.get_text().strip():
                    doc.close()
                    return True
            doc.close()
        except Exception as e:
            logger.error(f"Error checking PDF type for {pdf_path}: {e}")
        
        return False

    def get_processing_route(self, file_path):
        """
        Determines the route: 'docx', 'pdf_native', or 'pdf_ocr'.
        """
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None

        ext = os.path.splitext(file_path)[1].lower()
        logger.info(f"Analyzing file extension: {ext}")

        if ext == ".docx":
            logger.info("Route identified: DOCX (Native)")
            return "docx"
        
        if ext == ".pdf":
            logger.info("Performing deep analysis on PDF...")
            if self.is_pdf_digital(file_path):
                logger.info("Route identified: PDF (Native Text)")
                return "pdf_native"
            else:
                logger.warning("No text layer found. Route identified: PDF (OCR Required)")
                return "pdf_ocr"

        logger.error(f"Unsupported file format: {ext}")
        return None