// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Application State Management
const state = {
    pdf: null,
    currentScale: 1.0,
    baseScales: [], 
    totalPageCount: 0,
    pdfUrl: '',
    pdfName: 'Document.pdf'
};

// DOM Elements Initialization (Errors hatane ke liye clean kiya)
const el = {
    loadingScreen: document.getElementById('loading-screen'),
    renderContainer: document.getElementById('pdf-render-container'),
    viewerContainer: document.getElementById('viewer-container'),
    progressBar: document.getElementById('progress-bar'),
    pageNumSpan: document.getElementById('page-num'),
    countSpan: document.getElementById('page-count'), // Id matching fix
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    navWrapper: document.querySelector('.bottom-controller-wrapper')
};

// Extract query string parameter
function getPdfUrlFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('url') || 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
}

function getFilenameFromUrl(url) {
    try {
        const decodedUrl = decodeURIComponent(url);
        return decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1).split('?')[0] || 'Document.pdf';
    } catch (e) {
        return 'Document.pdf';
    }
}

// Main App Async Initialization Engine
async function initPdfReader() {
    state.pdfUrl = getPdfUrlFromQuery();
    state.pdfName = getFilenameFromUrl(state.pdfUrl);

    try {
        const loadingTask = pdfjsLib.getDocument({
            url: state.pdfUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/cmaps/',
            cMapPacked: true,
        });
        
        state.pdf = await loadingTask.promise;
        state.totalPageCount = state.pdf.numPages;
        
        if(el.countSpan) el.countSpan.textContent = state.totalPageCount;
        if(el.pageNumSpan) el.pageNumSpan.textContent = '1';

        // Render continuous pages sequentially
        await renderAllPages();
        
        // Hide overlay loading spinner gracefully
        if(el.loadingScreen) el.loadingScreen.classList.add('fade-out');
        setupScrollTracking();
    } catch (error) {
        console.error('Error loading PDF Document: ', error);
        alert("Failed to render the document. Please verify the network connection or file path structure.");
    }
}

// Sequential Asynchronous Multi-page Renderer
async function renderAllPages() {
    if(!el.renderContainer) return;
    el.renderContainer.innerHTML = '';
    state.baseScales = [];

    for (let pageNum = 1; pageNum <= state.totalPageCount; pageNum++) {
        const page = await state.pdf.getPage(pageNum);
        
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'page-wrapper';
        pageWrapper.id = `page-block-${pageNum}`;
        
        const canvas = document.createElement('canvas');
        pageWrapper.appendChild(canvas);
        el.renderContainer.appendChild(pageWrapper);

        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = el.viewerContainer.clientWidth - 20; 
        const mobileScaleFactor = containerWidth / viewport.width;
        
        state.baseScales[pageNum] = mobileScaleFactor;
        
        const context = canvas.getContext('2d', { alpha: false });
        const finalScale = mobileScaleFactor * state.currentScale;
        const finalViewport = page.getViewport({ scale: finalScale });

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(finalViewport.width * outputScale);
        canvas.height = Math.floor(finalViewport.height * outputScale);
        canvas.style.width = Math.floor(finalViewport.width) + "px";
        canvas.style.height = Math.floor(finalViewport.height) + "px";

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: finalViewport
        };

        await page.render(renderContext).promise;
    }
}

// Track reading progression details
function setupScrollTracking() {
    if(!el.viewerContainer) return;
    let lastScrollTop = 0;

    el.viewerContainer.addEventListener('scroll', () => {
        const scrollTop = el.viewerContainer.scrollTop;
        const scrollHeight = el.viewerContainer.scrollHeight - el.viewerContainer.clientHeight;
        
        const progressPercentage = (scrollTop / scrollHeight) * 100;
        if(el.progressBar) el.progressBar.style.width = `${progressPercentage}%`;

        if (scrollTop > lastScrollTop && scrollTop > 150) {
            if(el.navWrapper) el.navWrapper.classList.add('hide-nav');
        } else {
            if(el.navWrapper) el.navWrapper.classList.remove('hide-nav');
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

        const childNodes = el.renderContainer.children;
        for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            const rect = child.getBoundingClientRect();
            
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                if(el.pageNumSpan) el.pageNumSpan.textContent = i + 1;
                break;
            }
        }
    });
}

// Zoom functionality
if(el.btnZoomIn) {
    el.btnZoomIn.addEventListener('click', () => {
        if (state.currentScale >= 2.5) return; 
        state.currentScale += 0.25;
        reScaleDocument();
    });
}

if(el.btnZoomOut) {
    el.btnZoomOut.addEventListener('click', () => {
        if (state.currentScale <= 0.75) return; 
        state.currentScale -= 0.25;
        reScaleDocument();
    });
}

async function reScaleDocument() {
    if(el.loadingScreen) el.loadingScreen.classList.remove('fade-out');
    await renderAllPages();
    if(el.loadingScreen) el.loadingScreen.classList.add('fade-out');
}

// Fullscreen API implementation
if(el.btnFullscreen) {
    el.btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error enabling fullscreen: ${err.message}`);
            });
            const icon = el.btnFullscreen.querySelector('.material-icons-round');
            if(icon) icon.textContent = 'fullscreen_exit';
        } else {
            document.exitFullscreen();
            const icon = el.btnFullscreen.querySelector('.material-icons-round');
            if(icon) icon.textContent = 'fullscreen';
        }
    });
}

window.addEventListener('DOMContentLoaded', initPdfReader);
