# Automated Ground Truth Generator (Gemini 3 Edition)

An AI-powered tool designed to transform unstructured PDF and DOCX documents into structured, logical "Ground Truth" blocks for RAG (Retrieval-Augmented Generation) evaluation.

## Features
- **Multi-format Support:** Handles both PDF (via Vision) and DOCX natively.
- **Semantic Grouping:** Uses Google Gemini 3 Flash to group related content into logical blocks without data loss.
- **Image Extraction:** Automatically extracts embedded images from documents.
- **Clean Output:** Generates plain-text blocks wrapped in `====` markers, ready for evaluation pipelines.

## Setup
1. Clone the repo.
2. Install dependencies: `pip install -r requirements.txt`
3. Install Poppler (required for PDF processing).
4. Create a `.env` file with your `GOOGLE_API_KEY`.
5. Run the script: `python gt_generator_google.py`