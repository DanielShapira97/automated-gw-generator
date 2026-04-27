from utils.logger import setup_logger

logger = setup_logger("Segmenter")

class BlockBuilder:
    """
    Groups extracted text spans into logical blocks based on visual 
    and structural cues like font size, style, and spacing.
    """

    def __init__(self, font_size_threshold=2.0, y_distance_threshold=25.0):
        # Difference in font size that triggers a new block
        self.font_size_threshold = font_size_threshold
        # Vertical distance (in points/pixels) that triggers a new block
        self.y_distance_threshold = y_distance_threshold

    def segment_elements(self, elements):
        """
        Processes a list of elements (with text and metadata) and 
        returns a string with blocks separated by ==== markers.
        """
        if not elements:
            logger.warning("No elements provided for segmentation.")
            return ""

        logger.info(f"Starting segmentation for {len(elements)} elements.")
        
        blocks = []
        current_block_text = []
        
        # Initialize trackers with the first element
        last_font_size = elements[0].get("font_size")
        last_y_pos = elements[0].get("y_pos")
        last_style = elements[0].get("style")

        for i, el in enumerate(elements):
            text = el.get("text", "").strip()
            if not text:
                continue

            current_font_size = el.get("font_size")
            current_y_pos = el.get("y_pos")
            current_style = el.get("style")
            
            # Logic for starting a new block:
            # 1. Significant change in font size (e.g., transition to/from a header)
            font_changed = abs(current_font_size - last_font_size) > self.font_size_threshold
            
            # 2. Large vertical gap (for PDFs)
            gap_detected = False
            if current_y_pos is not None and last_y_pos is not None:
                # If Y increases, it means we moved down the page
                if (current_y_pos - last_y_pos) > self.y_distance_threshold:
                    gap_detected = True
            
            # 3. Style change (for DOCX - e.g., 'Normal' to 'Heading 1')
            style_changed = current_style != last_style

            if (font_changed or gap_detected or style_changed) and current_block_text:
                # Close previous block
                blocks.append(self._format_block(current_block_text))
                current_block_text = []
                logger.debug(f"New block started at element {i} (Reason: Font={font_changed}, Gap={gap_detected}, Style={style_changed})")

            current_block_text.append(text)
            
            # Update trackers for next iteration
            last_font_size = current_font_size
            last_y_pos = current_y_pos
            last_style = current_style

        # Add the final block
        if current_block_text:
            blocks.append(self._format_block(current_block_text))

        logger.info(f"Segmentation complete. Created {len(blocks)} blocks.")
        return "\n\n".join(blocks)

    def _format_block(self, text_list):
        """
        Wraps the block text with the requested ==== markers.
        """
        inner_text = " ".join(text_list)
        return f"====\n{inner_text}\n===="