import fitz  # PyMuPDF
from utils.logger import setup_logger

logger = setup_logger("NativePDF")

class NativePdfProcessor:
    """
    Extracts text and metadata from digital PDFs without using OCR.
    """

    def __init__(self):
        self.extracted_data = []

    def extract_text_with_metadata(self, pdf_path):
        """
        Extracts text blocks with font size and position data.
        """
        logger.info(f"Starting native extraction for: {pdf_path}")
        try:
            doc = fitz.open(pdf_path)
            full_content = []

            for page_num, page in enumerate(doc):
                logger.debug(f"Processing page {page_num + 1}...")
                
                # dict mode gives us rich information about spans, fonts, and sizes
                blocks = page.get_text("dict")["blocks"]
                
                for b in blocks:
                    if b['type'] == 0:  # block contains text
                        for line in b["lines"]:
                            for span in line["spans"]:
                                # We collect only necessary metadata for segmentation
                                metadata = {
                                    "text": span["text"],
                                    "font_size": round(span["size"], 1),
                                    "font_name": span["font"],
                                    "y_pos": round(span["origin"][1], 1),
                                    "is_bold": "bold" in span["font"].lower()
                                }
                                full_content.append(metadata)
            
            doc.close()
            logger.info(f"Successfully extracted {len(full_content)} text spans.")
            return full_content

        except Exception as e:
            logger.error(f"Failed to extract native text: {e}", exc_info=True)
            return []

    def extract_images(self, pdf_path, output_folder):
        """
        Extracts raw images from the PDF and saves them to the output folder.
        """
        logger.info("Extracting embedded images from PDF...")
        try:
            doc = fitz.open(pdf_path)
            image_count = 0

            for page_index in range(len(doc)):
                for img_index, img in enumerate(doc.get_page_images(page_index)):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    ext = base_image["ext"]

                    image_count += 1
                    image_name = f"img_p{page_index+1}_{image_count}.{ext}"
                    image_path = f"{output_folder}/{image_name}"

                    with open(image_path, "wb") as f:
                        f.write(image_bytes)
            
            doc.close()
            logger.info(f"Extracted {image_count} images successfully.")
            return image_count
        except Exception as e:
            logger.error(f"Image extraction failed: {e}")
            return 0