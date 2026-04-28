import os
import shutil
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

import main as non_llm_pipeline
from gt_generator_llms import gt_generator_google as llm_pipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/process")
async def process_file(
    file: UploadFile = File(...),
    mode: str = Form(...)  # 'classic', 'llm', 'compare'
):
    # Save the uploaded file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        def run_classic():
            p = non_llm_pipeline.process_document(file_path)
            with open(p, "r", encoding="utf-8") as f:
                return p, f.read()
                
        def run_llm():
            p = llm_pipeline.process_document(file_path, output_base="evaluation_results", poppler=os.getenv("POPPLER_PATH"))
            with open(p, "r", encoding="utf-8") as f:
                return p, f.read()

        if mode == 'compare':
            c_path, c_content = run_classic()
            l_path, l_content = run_llm()
            return {
                "success": True,
                "mode": "compare",
                "classic_content": c_content,
                "llm_content": l_content,
                "classic_path": c_path,
                "llm_path": l_path
            }
        elif mode == 'llm':
            l_path, l_content = run_llm()
            return {
                "success": True, 
                "mode": "llm",
                "content": l_content,
                "filename": os.path.basename(l_path),
                "result_path": l_path
            }
        else:
            c_path, c_content = run_classic()
            return {
                "success": True, 
                "mode": "classic",
                "content": c_content,
                "filename": os.path.basename(c_path),
                "result_path": c_path
            }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/download")
async def download_file(path: str):
    if os.path.exists(path):
        return FileResponse(path, filename=os.path.basename(path))
    return {"error": "File not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
