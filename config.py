import os

# --- Path Configurations ---
# The folder where results will be saved
OUTPUT_BASE_DIR = "evaluation_results"
# Folder for log files
LOG_FILE_PATH = "logs/pipeline.log"

# --- Segmentation Settings ---
# Sensitivity for starting a new block (font size difference)
FONT_SIZE_THRESHOLD = 2.0
# Vertical gap in pixels/points to trigger a new block
Y_DISTANCE_THRESHOLD = 25.0

# --- OCR Settings ---
# Default language for OCR engine
OCR_LANGUAGE = 'en'