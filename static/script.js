document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const processBtn = document.getElementById('process-btn');
    const resultContainer = document.getElementById('result-container');
    const singleView = document.getElementById('single-view');
    const resultText = document.getElementById('result-text');
    const compareView = document.getElementById('compare-view');
    const classicResultBox = document.getElementById('classic-result-box');
    const llmResultBox = document.getElementById('llm-result-box');
    const metricsDashboard = document.getElementById('metrics-dashboard');
    const diffToggle = document.getElementById('diff-toggle');
    const downloadBtn = document.getElementById('download-btn');
    const errorMsg = document.getElementById('error-message');
    const resultTitle = document.getElementById('result-title');
    
    let selectedFile = null;
    let currentResultPath = null;
    let currentFileName = null;
    
    // Stored texts for toggling diffs
    let classicRawText = "";
    let llmRawText = "";

    // --- File Drag and Drop Logic ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files), false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() { handleFiles(this.files); });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            const validExtensions = ['.pdf', '.docx'];
            const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            
            if (validExtensions.includes(fileExt)) {
                selectedFile = file;
                dropZone.querySelector('h3').textContent = file.name;
                dropZone.querySelector('p').textContent = `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
                processBtn.disabled = false;
                errorMsg.style.display = 'none';
            } else {
                showError('Please upload a valid .pdf or .docx file.');
                selectedFile = null;
                processBtn.disabled = true;
            }
        }
    }

    // --- Processing Logic ---
    processBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const btnText = processBtn.querySelector('.btn-text');
        const loader = processBtn.querySelector('.loader');
        
        btnText.style.display = 'none';
        loader.style.display = 'block';
        processBtn.disabled = true;
        resultContainer.style.display = 'none';
        metricsDashboard.style.display = 'none';
        errorMsg.style.display = 'none';
        
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('mode', mode);

        try {
            const response = await fetch('/api/process', { method: 'POST', body: formData });
            const data = await response.json();
            
            if (data.success) {
                if (data.mode === 'compare') {
                    handleCompareView(data);
                } else {
                    handleSingleView(data);
                }
                resultContainer.style.display = 'block';
                resultContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                showError(data.error || 'An unknown error occurred.');
            }
        } catch (error) {
            showError('Network error. Failed to connect to server.');
            console.error(error);
        } finally {
            btnText.style.display = 'block';
            loader.style.display = 'none';
            processBtn.disabled = false;
        }
    });

    function handleSingleView(data) {
        resultTitle.textContent = data.mode === 'classic' ? 'Extracted Text (Classic)' : 'Extracted Text (Completion Service)';
        singleView.style.display = 'block';
        compareView.style.display = 'none';
        metricsDashboard.style.display = 'none';
        
        resultText.value = data.content;
        currentResultPath = data.result_path;
        currentFileName = data.filename;
        downloadBtn.style.display = 'inline-flex';
    }

    function handleCompareView(data) {
        resultTitle.textContent = 'Comparison Results';
        singleView.style.display = 'none';
        compareView.style.display = 'grid';
        metricsDashboard.style.display = 'block';
        downloadBtn.style.display = 'none'; // Download is tricky for compare mode, hiding for now.
        
        classicRawText = data.classic_content || '';
        llmRawText = data.llm_content || '';

        // Calculate Metrics
        document.getElementById('m-classic-words').textContent = countWords(classicRawText);
        document.getElementById('m-llm-words').textContent = countWords(llmRawText);
        document.getElementById('m-classic-blocks').textContent = countBlocks(classicRawText);
        document.getElementById('m-llm-blocks').textContent = countBlocks(llmRawText);

        renderDiffs();
    }

    function countWords(str) {
        return str.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    function countBlocks(str) {
        const matches = str.match(/====/g);
        // Each block has two markers, so divide by 2
        return matches ? Math.floor(matches.length / 2) : 0;
    }

    // --- Diffing Logic ---
    diffToggle.addEventListener('change', () => {
        renderDiffs();
    });

    function renderDiffs() {
        if (!diffToggle.checked) {
            classicResultBox.textContent = classicRawText;
            llmResultBox.textContent = llmRawText;
            return;
        }

        if (typeof diff_match_patch === 'undefined') {
            showError('Diff library not loaded.');
            return;
        }

        const dmp = new diff_match_patch();
        // Compute diff at character level
        const diffs = dmp.diff_main(classicRawText, llmRawText);
        // Clean up diff to make it semantically readable
        dmp.diff_cleanupSemantic(diffs);

        let classicHtml = '';
        let llmHtml = '';

        diffs.forEach(part => {
            const op = part[0];    // Operation (insert, delete, equal)
            const text = part[1];  // Text of change
            
            // Escape HTML to prevent injection
            const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            if (op === 1) {
                // Inserted text (exists in LLM, not in Classic)
                llmHtml += `<ins>${safeText}</ins>`;
            } else if (op === -1) {
                // Deleted text (exists in Classic, not in LLM)
                classicHtml += `<del>${safeText}</del>`;
            } else {
                // Equal text
                classicHtml += safeText;
                llmHtml += safeText;
            }
        });

        classicResultBox.innerHTML = classicHtml;
        llmResultBox.innerHTML = llmHtml;
    }

    // --- Download Logic ---
    downloadBtn.addEventListener('click', () => {
        if (currentResultPath && currentFileName) {
            window.location.href = `/api/download?path=${encodeURIComponent(currentResultPath)}`;
        }
    });

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }
});
