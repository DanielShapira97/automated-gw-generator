import os
from config import *
from utils.logger import setup_logger
from core.router import DocumentRouter
from core.segmentation import BlockBuilder
from engines.pdf_native import NativePdfProcessor
from engines.docx_native import DocxProcessor
from engines.ocr_engine import OcrProcessor

# Initialize global logger
logger = setup_logger("MainPipeline")

def process_document(file_path):
    """
    Main orchestration logic for a single document.
    """
    file_name = os.path.basename(file_path)
    doc_name = os.path.splitext(file_name)[0]
    
    # 1. Create document-specific output folder
    doc_output_dir = os.path.join(OUTPUT_BASE_DIR, doc_name)
    os.makedirs(doc_output_dir, exist_ok=True)
    
    logger.info(f"--- Processing Started: {file_name} ---")

    # 2. Routing: Decide how to process the file
    router = DocumentRouter()
    route = router.get_processing_route(file_path)
    
    if not route:
        logger.error(f"Could not determine route for {file_name}. Skipping.")
        return

    # 3. Processing & Image Extraction
    elements = []
    if route == "docx":
        processor = DocxProcessor()
        elements = processor.extract_text_with_metadata(file_path)
        processor.extract_images(file_path, doc_output_dir)
        
    elif route == "pdf_native":
        processor = NativePdfProcessor()
        elements = processor.extract_text_with_metadata(file_path)
        processor.extract_images(file_path, doc_output_dir)
        
    elif route == "pdf_ocr":
        processor = OcrProcessor(lang=OCR_LANGUAGE)
        # For OCR, we pass the output dir to save page images as we go
        elements = processor.extract_text_with_metadata(file_path, doc_output_dir)

    # 4. Segmentation: Structure into blocks
    if elements:
        builder = BlockBuilder(
            font_size_threshold=FONT_SIZE_THRESHOLD, 
            y_distance_threshold=Y_DISTANCE_THRESHOLD
        )
        final_gt_content = builder.segment_elements(elements)
        
        # 5. Save final Ground Truth file
        gt_filename = f"{doc_name}_ground_truth.txt"
        gt_path = os.path.join(doc_output_dir, gt_filename)
        
        with open(gt_path, "w", encoding="utf-8") as f:
            f.write(final_gt_content)
        
        logger.info(f"Success! Ground Truth saved to: {gt_path}")
    else:
        logger.warning(f"No text extracted for {file_name}. Ground Truth file was not created.")

def main():
    # Example: Path to your input file
    # In a real scenario, you could loop over a folder
    input_file = "path/to/your/document.pdf" 
    
    if os.path.exists(input_file):
        process_document(input_file)
    else:
        logger.error(f"Input file not found at: {input_file}")

if __name__ == "__main__":
    main()