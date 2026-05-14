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
    const saveGwBtn = document.getElementById('save-gw-btn');
    const compareDownloadRow = document.getElementById('compare-download-row');
    const compareDownloadClassic = document.getElementById('compare-download-classic');
    const compareDownloadLlm = document.getElementById('compare-download-llm');
    const imagesSection = document.getElementById('images-section');
    const imagesList = document.getElementById('images-list');
    const errorMsg = document.getElementById('error-message');
    const resultTitle = document.getElementById('result-title');

    const uploadPreviewCard = document.getElementById('upload-preview-card');
    const uploadPreviewHint = document.getElementById('upload-preview-hint');
    const uploadPreviewPdfWrap = document.getElementById('upload-preview-pdf-wrap');
    const uploadPreviewPdf = document.getElementById('upload-preview-pdf');
    const uploadPreviewDocxFrame = document.getElementById('upload-preview-docx-frame');

    const gwEditorPanel = document.getElementById('gw-editor-panel');
    const gwBlocksContainer = document.getElementById('gw-blocks-container');
    const gwSplitBlock = document.getElementById('gw-split-block');
    const gwMergePrev = document.getElementById('gw-merge-prev');
    const gwMergeNext = document.getElementById('gw-merge-next');

    const toggleGwCompareEditor = document.getElementById('toggle-gw-compare-editor');
    const gwEditorComparePanel = document.getElementById('gw-editor-compare-panel');
    const gwBlocksContainerCompare = document.getElementById('gw-blocks-container-compare');
    const gwSplitBlockCompare = document.getElementById('gw-split-block-compare');
    const gwMergePrevCompare = document.getElementById('gw-merge-prev-compare');
    const gwMergeNextCompare = document.getElementById('gw-merge-next-compare');
    const downloadLlmEditedCompare = document.getElementById('download-llm-edited-compare');

    let selectedFile = null;
    let currentResultPath = null;
    let currentFileName = null;
    let currentImagePaths = [];
    let currentMode = 'classic';
    let pdfPreviewUrl = null;

    let classicRawText = '';
    let llmRawText = '';
    let compareClassicPath = '';
    let compareLlmPath = '';

    let gwBlocksSingle = [];
    let gwBlocksCompare = [];
    /** Last textarea focused inside each editor (toolbar clicks steal document.activeElement). */
    let lastGwTextareaSingle = null;
    let lastGwTextareaCompare = null;
    /** Map blockIndex string -> {s0,s1} captured on split-button pointerdown before selection may collapse (H3). */
    let gwSplitSnapshotSingle = null;
    let gwSplitSnapshotCompare = null;

    function snapshotGwSelectionsForSplit(container) {
        const m = new Map();
        if (!container) return m;
        container.querySelectorAll('.gw-block-textarea').forEach((el) => {
            m.set(String(el.dataset.blockIndex), { s0: el.selectionStart, s1: el.selectionEnd });
        });
        return m;
    }

    function mergeImagePathsUnique(a, b) {
        const seen = new Set();
        const out = [];
        for (const p of [...(a || []), ...(b || [])]) {
            if (!p || seen.has(p)) continue;
            seen.add(p);
            out.push(p);
        }
        return out;
    }

    function clearUploadPreview() {
        if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            pdfPreviewUrl = null;
        }
        uploadPreviewPdf.removeAttribute('src');
        uploadPreviewDocxFrame.removeAttribute('srcdoc');
        uploadPreviewPdfWrap.style.display = 'none';
        uploadPreviewDocxFrame.style.display = 'none';
        uploadPreviewCard.style.display = 'none';
    }

    async function updateUploadPreview(file) {
        clearUploadPreview();
        if (!file) return;

        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        uploadPreviewCard.style.display = 'block';

        if (ext === '.pdf') {
            pdfPreviewUrl = URL.createObjectURL(file);
            uploadPreviewPdf.src = pdfPreviewUrl;
            uploadPreviewPdfWrap.style.display = 'block';
            uploadPreviewHint.textContent = 'PDF preview (local, before processing).';
            return;
        }

        if (ext === '.docx') {
            uploadPreviewHint.textContent = 'Loading HTML preview…';
            const fd = new FormData();
            fd.append('file', file);
            try {
                const res = await fetch('/api/preview-docx', { method: 'POST', body: fd });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || data.error || 'Preview failed');
                }
                const notice = data.truncated
                    ? '<p style="color:#666;font-size:12px;margin:0 0 8px 0;">Preview truncated for size.</p>'
                    : '';
                uploadPreviewDocxFrame.srcdoc = notice + (data.html || '');
                uploadPreviewDocxFrame.style.display = 'block';
                uploadPreviewHint.textContent = 'DOCX layout preview (HTML from server).';
            } catch (e) {
                uploadPreviewHint.textContent = 'Could not load DOCX preview: ' + (e.message || String(e));
            }
        }
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

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
                void updateUploadPreview(file);
            } else {
                showError('Please upload a valid .pdf or .docx file.');
                selectedFile = null;
                processBtn.disabled = true;
                clearUploadPreview();
            }
        }
    }

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

    function parseGwToBlocks(text) {
        const t = (text || '').trim();
        if (!t) {
            return [''];
        }
        const re = /====\s*\r?\n([\s\S]*?)\r?\n====/g;
        const blocks = [];
        let m;
        while ((m = re.exec(t)) !== null) {
            blocks.push(m[1]);
        }
        if (blocks.length) {
            return blocks;
        }
        return [t];
    }

    function serializeGwFromBlocks(blocks) {
        return blocks.map((b) => `====\n${String(b).trim()}\n====`).join('\n\n');
    }

    function renderGwBlocks(container, blocks, isCompare) {
        container.innerHTML = '';
        blocks.forEach((body, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'gw-block-wrap';

            const label = document.createElement('div');
            label.className = 'gw-block-label';
            label.textContent = `Block ${idx + 1}`;

            const ta = document.createElement('textarea');
            ta.className = 'gw-block-textarea';
            ta.dataset.blockIndex = String(idx);
            ta.value = body;
            ta.addEventListener('input', () => {
                const arr = isCompare ? gwBlocksCompare : gwBlocksSingle;
                arr[idx] = ta.value;
                if (isCompare) {
                    llmRawText = serializeGwFromBlocks(gwBlocksCompare);
                    document.getElementById('m-llm-words').textContent = countWords(llmRawText);
                    document.getElementById('m-llm-blocks').textContent = countBlocks(llmRawText);
                } else if (currentMode === 'llm') {
                    const full = serializeGwFromBlocks(gwBlocksSingle);
                    document.getElementById('m-llm-words').textContent = countWords(full);
                    document.getElementById('m-llm-blocks').textContent = countBlocks(full);
                }
            });

            wrap.appendChild(label);
            wrap.appendChild(ta);
            container.appendChild(wrap);
        });
    }

    if (gwBlocksContainer) {
        gwBlocksContainer.addEventListener('focusin', (e) => {
            if (e.target.classList?.contains('gw-block-textarea')) {
                lastGwTextareaSingle = e.target;
            }
        });
    }
    if (gwBlocksContainerCompare) {
        gwBlocksContainerCompare.addEventListener('focusin', (e) => {
            if (e.target.classList?.contains('gw-block-textarea')) {
                lastGwTextareaCompare = e.target;
            }
        });
    }

    function syncGwBlocksFromDom(container, blocksArr) {
        container.querySelectorAll('.gw-block-textarea').forEach((el) => {
            const idx = parseInt(el.dataset.blockIndex, 10);
            if (!Number.isNaN(idx) && idx >= 0 && idx < blocksArr.length) {
                blocksArr[idx] = el.value;
            }
        });
    }

    function getFocusedGwTextarea(container) {
        const lastRef = container === gwBlocksContainerCompare ? lastGwTextareaCompare : lastGwTextareaSingle;
        const active = document.activeElement;
        if (active && active.classList.contains('gw-block-textarea') && container.contains(active)) {
            return active;
        }
        if (lastRef && lastRef.classList?.contains('gw-block-textarea') && container.contains(lastRef)) {
            return lastRef;
        }
        return container.querySelector('.gw-block-textarea');
    }

    function splitAtSelection(container, blocksArr) {
        syncGwBlocksFromDom(container, blocksArr);
        const ta = getFocusedGwTextarea(container);
        if (!ta) {
            showError('Click inside a block first.');
            return;
        }
        const i = parseInt(ta.dataset.blockIndex, 10);
        let s0 = ta.selectionStart;
        let s1 = ta.selectionEnd;
        const snapMap = container === gwBlocksContainerCompare ? gwSplitSnapshotCompare : gwSplitSnapshotSingle;
        const snapKey = String(ta.dataset.blockIndex);
        let usedSelectionSnapshot = false;
        if (s0 === s1 && snapMap && snapMap.size) {
            const snap = snapMap.get(snapKey);
            if (snap && snap.s0 !== snap.s1) {
                s0 = snap.s0;
                s1 = snap.s1;
                usedSelectionSnapshot = true;
            }
        }
        if (container === gwBlocksContainerCompare) {
            gwSplitSnapshotCompare = null;
        } else {
            gwSplitSnapshotSingle = null;
        }
        if (s0 === s1) {
            showError('Select text inside a block to start a new block at that point.');
            return;
        }
        const val = ta.value;
        const lo = Math.min(s0, s1);
        const hi = Math.max(s0, s1);
        const before = val.slice(0, lo);
        const mid = val.slice(lo, hi);
        const after = val.slice(hi);
        const pieces = [before, mid, after].filter((chunk) => chunk.length > 0);
        if (pieces.length === 0) {
            return;
        }
        blocksArr.splice(i, 1, ...pieces);
        renderGwBlocks(container, blocksArr, container === gwBlocksContainerCompare);
        refreshMetricsAfterGwEdit(container);
    }

    function mergeWithPrev(container, blocksArr) {
        syncGwBlocksFromDom(container, blocksArr);
        const ta = getFocusedGwTextarea(container);
        if (!ta) {
            showError('Click inside a block first.');
            return;
        }
        const i = parseInt(ta.dataset.blockIndex, 10);
        if (i <= 0) {
            showError('No previous block to merge with.');
            return;
        }
        blocksArr[i - 1] = `${blocksArr[i - 1].trimEnd()}\n\n${blocksArr[i].trimStart()}`;
        blocksArr.splice(i, 1);
        renderGwBlocks(container, blocksArr, container === gwBlocksContainerCompare);
        refreshMetricsAfterGwEdit(container);
    }

    function mergeWithNext(container, blocksArr) {
        syncGwBlocksFromDom(container, blocksArr);
        const ta = getFocusedGwTextarea(container);
        if (!ta) {
            showError('Click inside a block first.');
            return;
        }
        const i = parseInt(ta.dataset.blockIndex, 10);
        if (i >= blocksArr.length - 1) {
            showError('No next block to merge with.');
            return;
        }
        blocksArr[i] = `${blocksArr[i].trimEnd()}\n\n${blocksArr[i + 1].trimStart()}`;
        blocksArr.splice(i + 1, 1);
        renderGwBlocks(container, blocksArr, container === gwBlocksContainerCompare);
        refreshMetricsAfterGwEdit(container);
    }

    function refreshMetricsAfterGwEdit(container) {
        if (container === gwBlocksContainerCompare) {
            llmRawText = serializeGwFromBlocks(gwBlocksCompare);
            document.getElementById('m-llm-words').textContent = countWords(llmRawText);
            document.getElementById('m-llm-blocks').textContent = countBlocks(llmRawText);
        } else if (currentMode === 'llm') {
            const full = serializeGwFromBlocks(gwBlocksSingle);
            document.getElementById('m-llm-words').textContent = countWords(full);
            document.getElementById('m-llm-blocks').textContent = countBlocks(full);
        }
    }

    [gwSplitBlock, gwMergePrev, gwMergeNext, gwSplitBlockCompare, gwMergePrevCompare, gwMergeNextCompare].forEach(
        (btn) => {
            if (btn) {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
            }
        }
    );

    if (gwSplitBlock && gwBlocksContainer) {
        gwSplitBlock.addEventListener('pointerdown', () => {
            gwSplitSnapshotSingle = snapshotGwSelectionsForSplit(gwBlocksContainer);
        });
    }
    if (gwSplitBlockCompare && gwBlocksContainerCompare) {
        gwSplitBlockCompare.addEventListener('pointerdown', () => {
            gwSplitSnapshotCompare = snapshotGwSelectionsForSplit(gwBlocksContainerCompare);
        });
    }

    gwSplitBlock.addEventListener('click', () => splitAtSelection(gwBlocksContainer, gwBlocksSingle));
    gwMergePrev.addEventListener('click', () => mergeWithPrev(gwBlocksContainer, gwBlocksSingle));
    gwMergeNext.addEventListener('click', () => mergeWithNext(gwBlocksContainer, gwBlocksSingle));

    gwSplitBlockCompare.addEventListener('click', () => splitAtSelection(gwBlocksContainerCompare, gwBlocksCompare));
    gwMergePrevCompare.addEventListener('click', () => mergeWithPrev(gwBlocksContainerCompare, gwBlocksCompare));
    gwMergeNextCompare.addEventListener('click', () => mergeWithNext(gwBlocksContainerCompare, gwBlocksCompare));

    toggleGwCompareEditor.addEventListener('click', () => {
        const open = gwEditorComparePanel.style.display === 'none';
        gwEditorComparePanel.style.display = open ? 'block' : 'none';
        llmResultBox.style.display = open ? 'none' : 'block';
        toggleGwCompareEditor.textContent = open ? 'Show completion diff view' : 'Edit completion GW as blocks';
        if (open) {
            gwBlocksCompare = parseGwToBlocks(llmRawText);
            renderGwBlocks(gwBlocksContainerCompare, gwBlocksCompare, true);
            saveGwBtn.style.display = 'inline-flex';
            downloadLlmEditedCompare.style.display = 'inline-block';
        } else {
            saveGwBtn.style.display = 'none';
            downloadLlmEditedCompare.style.display = 'none';
            renderDiffs();
        }
    });

    downloadLlmEditedCompare.addEventListener('click', () => {
        const name = compareLlmPath ? compareLlmPath.split(/[/\\]/).pop() : 'completion_ground_truth.txt';
        downloadBlob(name, serializeGwFromBlocks(gwBlocksCompare));
    });

    function handleSingleView(data) {
        currentMode = data.mode;
        resultTitle.textContent = data.mode === 'classic' ? 'Extracted Text (Classic)' : 'Extracted Text (Completion Service)';
        singleView.style.display = 'block';
        compareView.style.display = 'none';
        metricsDashboard.style.display = 'block';
        document.getElementById('m-classic-words').textContent = data.mode === 'classic' ? countWords(data.content) : '-';
        document.getElementById('m-llm-words').textContent = data.mode === 'llm' ? countWords(data.content) : '-';
        document.getElementById('m-classic-blocks').textContent = data.mode === 'classic' ? countBlocks(data.content) : '-';
        document.getElementById('m-llm-blocks').textContent = data.mode === 'llm' ? countBlocks(data.content) : '-';

        currentResultPath = data.result_path;
        currentFileName = data.filename;
        currentImagePaths = data.image_paths || [];
        renderImageLinksSingle(currentImagePaths);

        if (data.mode === 'llm') {
            resultText.style.display = 'none';
            gwEditorPanel.style.display = 'block';
            gwBlocksSingle = parseGwToBlocks(data.content);
            renderGwBlocks(gwBlocksContainer, gwBlocksSingle, false);
            saveGwBtn.style.display = 'inline-flex';
        } else {
            resultText.style.display = 'block';
            gwEditorPanel.style.display = 'none';
            resultText.readOnly = true;
            resultText.value = data.content;
            saveGwBtn.style.display = 'none';
        }

        downloadBtn.style.display = 'inline-flex';
        compareDownloadRow.style.display = 'none';
    }

    function handleCompareView(data) {
        currentMode = 'compare';
        resultTitle.textContent = 'Comparison Results';
        singleView.style.display = 'none';
        compareView.style.display = 'grid';
        metricsDashboard.style.display = 'block';
        downloadBtn.style.display = 'none';
        saveGwBtn.style.display = 'none';

        classicRawText = data.classic_content || '';
        llmRawText = data.llm_content || '';
        compareClassicPath = data.classic_path || '';
        compareLlmPath = data.llm_path || '';

        compareDownloadRow.style.display = 'flex';
        if (compareClassicPath) {
            compareDownloadClassic.href = `/api/download?path=${encodeURIComponent(compareClassicPath)}`;
        }
        if (compareLlmPath) {
            compareDownloadLlm.href = `/api/download?path=${encodeURIComponent(compareLlmPath)}`;
        }

        const mergedImages =
            data.image_paths && data.image_paths.length > 0
                ? data.image_paths
                : mergeImagePathsUnique(data.classic_image_paths || [], data.llm_image_paths || []);
        currentImagePaths = mergedImages;
        renderImageLinksCompare(mergedImages);

        document.getElementById('m-classic-words').textContent = countWords(classicRawText);
        document.getElementById('m-llm-words').textContent = countWords(llmRawText);
        document.getElementById('m-classic-blocks').textContent = countBlocks(classicRawText);
        document.getElementById('m-llm-blocks').textContent = countBlocks(llmRawText);

        gwEditorComparePanel.style.display = 'none';
        downloadLlmEditedCompare.style.display = 'none';
        llmResultBox.style.display = 'block';
        toggleGwCompareEditor.textContent = 'Edit completion GW as blocks';

        renderDiffs();
    }

    function countWords(str) {
        return str.trim().split(/\s+/).filter((word) => word.length > 0).length;
    }

    function countBlocks(str) {
        const matches = str.match(/====/g);
        return matches ? Math.floor(matches.length / 2) : 0;
    }

    diffToggle.addEventListener('change', () => {
        renderDiffs();
    });

    function renderDiffs() {
        if (gwEditorComparePanel.style.display === 'block') {
            return;
        }
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
        const diffs = dmp.diff_main(classicRawText, llmRawText);
        dmp.diff_cleanupSemantic(diffs);

        let classicHtml = '';
        let llmHtml = '';

        diffs.forEach((part) => {
            const op = part[0];
            const text = part[1];
            const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            if (op === 1) {
                llmHtml += `<ins>${safeText}</ins>`;
            } else if (op === -1) {
                classicHtml += `<del>${safeText}</del>`;
            } else {
                classicHtml += safeText;
                llmHtml += safeText;
            }
        });

        classicResultBox.innerHTML = classicHtml;
        llmResultBox.innerHTML = llmHtml;
    }

    function downloadBlob(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    downloadBtn.addEventListener('click', () => {
        if (currentMode === 'llm' && gwEditorPanel.style.display !== 'none') {
            const text = serializeGwFromBlocks(gwBlocksSingle);
            downloadBlob(currentFileName || 'ground_truth.txt', text);
            return;
        }
        if (currentResultPath && currentFileName) {
            window.location.href = `/api/download?path=${encodeURIComponent(currentResultPath)}`;
        }
    });

    saveGwBtn.addEventListener('click', async () => {
        let path = currentResultPath;
        let content = '';
        if (currentMode === 'llm') {
            content = serializeGwFromBlocks(gwBlocksSingle);
        } else if (currentMode === 'compare' && gwEditorComparePanel.style.display === 'block') {
            path = compareLlmPath;
            content = serializeGwFromBlocks(gwBlocksCompare);
            llmRawText = content;
        } else {
            return;
        }
        if (!path) {
            showError('No file path to save.');
            return;
        }
        try {
            const res = await fetch('/api/save-gw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message || data.error;
                throw new Error(msg || 'Save failed');
            }
            errorMsg.textContent = 'Saved successfully.';
            errorMsg.style.display = 'block';
            errorMsg.style.color = 'var(--success)';
            setTimeout(() => {
                errorMsg.style.display = 'none';
                errorMsg.style.color = '';
            }, 2500);
        } catch (e) {
            showError(e.message || String(e));
        }
    });

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }

    function renderImageLinksSingle(paths) {
        imagesList.innerHTML = '';
        const deduped = Array.from(new Set(paths || []));
        if (!deduped.length) {
            imagesSection.style.display = 'none';
            return;
        }

        imagesSection.style.display = 'block';
        const title = document.createElement('div');
        title.textContent = 'Single mode images';
        title.style.fontWeight = '600';
        title.style.marginBottom = '8px';
        imagesList.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'image-preview-grid';
        deduped.forEach((imgPath, index) => {
            grid.appendChild(createImagePreviewCard(imgPath, `Download image ${index + 1}`));
        });
        imagesList.appendChild(grid);
    }

    function renderImageLinksCompare(mergedPaths) {
        imagesList.innerHTML = '';
        const paths = Array.from(new Set(mergedPaths || []));
        if (!paths.length) {
            imagesSection.style.display = 'none';
            return;
        }

        imagesSection.style.display = 'block';
        const title = document.createElement('div');
        title.textContent = 'Extracted images';
        title.style.fontWeight = '600';
        title.style.marginBottom = '8px';
        imagesList.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'image-preview-grid';
        paths.forEach((imgPath, index) => {
            grid.appendChild(createImagePreviewCard(imgPath, `Download image ${index + 1}`));
        });
        imagesList.appendChild(grid);
    }

    function previewImageUrl(imgPath) {
        return `/api/preview?path=${encodeURIComponent(imgPath)}`;
    }

    function createImagePreviewCard(imgPath, downloadLabel) {
        const card = document.createElement('div');
        card.className = 'image-preview-card';

        const img = document.createElement('img');
        img.src = previewImageUrl(imgPath);
        img.alt = downloadLabel;
        img.loading = 'lazy';
        img.className = 'image-preview-thumb';
        img.onerror = () => {
            img.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'image-preview-fallback';
            fallback.textContent = 'Preview unavailable';
            card.insertBefore(fallback, card.firstChild);
        };

        const actions = document.createElement('div');
        actions.className = 'image-preview-actions';

        const link = document.createElement('a');
        link.href = `/api/download?path=${encodeURIComponent(imgPath)}`;
        link.textContent = downloadLabel;
        link.className = 'image-preview-download';

        actions.appendChild(link);
        card.appendChild(img);
        card.appendChild(actions);
        return card;
    }
});
