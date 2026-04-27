import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler

# Log format: Timestamp | Level | Component Name | Message
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

def setup_logger(name: str, log_file: str = "logs/pipeline.log"):
    """
    Configures a logger that outputs to both the console and a rotating file.
    """
    # Ensure the logs directory exists
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    # Prevent adding multiple handlers if the logger is already configured
    if logger.hasHandlers():
        return logger

    # 1. File Handler: Rotating logs to keep file size manageable
    # Max size 5MB, keeps up to 3 backup files
    file_handler = RotatingFileHandler(
        log_file, maxBytes=5*1024*1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    file_handler.setLevel(logging.DEBUG)

    # 2. Console Handler: Real-time feedback in the terminal
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    console_handler.setLevel(logging.INFO)  # Terminal shows INFO and above

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger