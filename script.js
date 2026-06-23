// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Application State Management
const state = {
    pdf: null,
    currentScale: 1.0,
    baseScales: [], // Keeps track of original scales relative to viewport device width
    totalPageCount: 0,
    pdfUrl: '',
    pdfName: 'Document.pdf'
};

// DOM Elements Initialization
const el = {
    loadingScreen: document.getElementById('loading-screen'),
    pdfTitle: document.getElementById('pdf-title'),
    renderContainer: document.getElementById('pdf-render-container'),
    viewerContainer: document.getElementById('viewer-container'),
    progressBar: document.getElementById('progress-bar'),
    pageNumSpan: document.getElementById('page-num'),
    pageCountSpan: document.getElementById('page-count'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    btnDownload: document.getElementById('btn-download'),
    navWrapper: document.querySelector('.bottom-controller-wrapper')
};

// Extract query string parameter to read dynamically passed PDF urls
function getPdfUrlFromQuery() {
    const params = new URLSearchParams(window.location.search);
    // Fallback template URL to avoid crashes if no parameter is provided
    return params.get('url') || 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';
}

// Extract filename to display on app header title
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
    el.pdfTitle.textContent = state.pdfName;

    try {
        const loadingTask = pdfjsLib.getDocument({
            url: state.pdfUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/cmaps/',
            cMapPacked: true,
        });
        
        state.pdf = await loadingTask.promise;
        state.totalPageCount = state.pdf.numPages;
        el.pageCountSpan.textContent = state.totalPageCount;
        el.pageNumSpan.textContent = '1';

        // Render continuous pages sequentially
        await renderAllPages();
        
        // Hide overlay loading spinner gracefully
        el.loadingScreen.classList.add('fade-out');
        setupScrollTracking();
    } catch (error) {
        console.error('Error loading PDF Document: ', error);
        el.pdfTitle.textContent = "Error Loading Document";
        alert("Failed to render the document. Please verify the network connection or file path structure.");
    }
}

// Sequential Asynchronous Multi-page Renderer
async function renderAllPages() {
    el.renderContainer.innerHTML = '';
    state.baseScales = [];

    for (let pageNum = 1; pageNum <= state.totalPageCount; pageNum++) {
        const page = await state.pdf.getPage(pageNum);
        
        // Container block layout
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'page-wrapper';
        pageWrapper.id = `page-block-${pageNum}`;
        
        const canvas = document.createElement('canvas');
        pageWrapper.appendChild(canvas);
        el.renderContainer.appendChild(pageWrapper);

        // Responsive Mobile Auto-scaling calculations
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = el.viewerContainer.clientWidth - 20; // safe padding boundaries
        const mobileScaleFactor = containerWidth / viewport.width;
        
        state.baseScales[pageNum] = mobileScaleFactor;
        
        // Execute Native Canvas Rendering Context
        const context = canvas.getContext('2d', { alpha: false });
        const finalScale = mobileScaleFactor * state.currentScale;
        const finalViewport = page.getViewport({ scale: finalScale });

        // Optimize high-density viewports for crisp text scaling
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

// Track reading progression details and active index viewports
function setupScrollTracking() {
    let lastScrollTop = 0;

    el.viewerContainer.addEventListener('scroll', () => {
        const scrollTop = el.viewerContainer.scrollTop;
        const scrollHeight = el.viewerContainer.scrollHeight - el.viewerContainer.clientHeight;
        
        // 1. Calculate & update reading progress line top indicator
        const progressPercentage = (scrollTop / scrollHeight) * 100;
        el.progressBar.style.width = `${progressPercentage}%`;

        // 2. Hide Floating bottom UI controls on scroll down, show on scroll up
        if (scrollTop > lastScrollTop && scrollTop > 150) {
            el.navWrapper.classList.add('hide-nav');
        } else {
            el.navWrapper.classList.remove('hide-nav');
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

        // 3. Detect current page visible in view tracking layout bounds
        const childNodes = el.renderContainer.children;
        for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            const rect = child.getBoundingClientRect();
            
            // If the midpoint of the container belongs inside the view
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                el.pageNumSpan.textContent = i + 1;
                break;
            }
        }
    });
}

// Zoom functionality trigger methods
el.btnZoomIn.addEventListener('click', () => {
    if (state.currentScale >= 2.5) return; // Scale boundaries max safe guard
    state.currentScale += 0.25;
    reScaleDocument();
});

el.btnZoomOut.addEventListener('click', () => {
    if (state.currentScale <= 0.75) return; // Scale boundaries min safe guard
    state.currentScale -= 0.25;
    reScaleDocument();
});

async function reScaleDocument() {
    el.loadingScreen.classList.remove('fade-out');
    await renderAllPages();
    el.loadingScreen.classList.add('fade-out');
}

// Fullscreen API implementation interface
el.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.error(`Error enabling fullscreen: ${err.message}`);
        });
        el.btnFullscreen.querySelector('.material-icons-round').textContent = 'fullscreen_exit';
    } else {
        document.exitFullscreen();
        el.btnFullscreen.querySelector('.material-icons-round').textContent = 'fullscreen';
    }
});

// Download PDF directly through system browser fallback channel
el.btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = state.pdfUrl;
    link.download = state.pdfName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Trigger setup execution routines upon window loaded events fully mapped
window.addEventListener('DOMContentLoaded', initPdfReader);
