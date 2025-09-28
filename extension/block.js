// Add safe messaging helper function to handle missing receivers gracefully
function sendMessageSafely(message, callback) {
    try {
        chrome.runtime.sendMessage(message, response => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                // This will happen normally when no listeners - don't treat as an error
                console.log('Expected messaging error (receiver likely not active):', lastError.message);
            } else if (callback) {
                callback(response);
            }
        });
    } catch (e) {
        console.log('Failed to send message:', e);
    }
}

// Simplified cursor handling
document.addEventListener('DOMContentLoaded', () => {
    const cursor = document.querySelector('.custom-cursor');
    const ring = document.querySelector('.cursor-ring');
    const dot = document.querySelector('.cursor-dot');

    // Show cursor when mouse moves
    document.addEventListener('mousemove', (e) => {
        cursor.style.display = 'block';
        const x = e.pageX;
        const y = e.pageY;

        ring.style.left = x + 'px';
        ring.style.top = y + 'px';
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
    });

    // Hide system cursor
    document.body.style.cursor = 'none';
});

// Track analysis state globally
let isAnalyzing = false;
let hasRedirected = false;
let globalRedirectFlag = false;

// Add state persistence object
const blockPageState = {
    reason: '',
    url: '',
    originalUrl: '',
    domain: '',
    explanation: '',
    blockedUrl: '',
    errorMessage: '',
    currentSection: 'no-session',
    
    // Save current state to chrome storage
    save: function() {
        chrome.storage.local.set({
            blockPageState: {
                reason: this.reason,
                url: this.url,
                originalUrl: this.originalUrl,
                domain: this.domain,
                explanation: this.explanation,
                blockedUrl: this.blockedUrl,
                errorMessage: this.errorMessage,
                currentSection: this.currentSection
            }
        }, () => {
            console.log('Block page state saved');
        });
    },
    
    // Restore state from chrome storage
    restore: function() {
        chrome.storage.local.get(['blockPageState'], (data) => {
            if (data.blockPageState) {
                console.log('Restoring block page state:', data.blockPageState);
                
                this.reason = data.blockPageState.reason || '';
                this.url = data.blockPageState.url || '';
                this.originalUrl = data.blockPageState.originalUrl || '';
                this.domain = data.blockPageState.domain || '';
                this.explanation = data.blockPageState.explanation || '';
                this.blockedUrl = data.blockPageState.blockedUrl || '';
                this.errorMessage = data.blockPageState.errorMessage || '';
                this.currentSection = data.blockPageState.currentSection || 'no-session';
                
                // Apply restored state to UI
                if (this.blockedUrl) {
                    document.getElementById('blockedUrl').textContent = this.blockedUrl;
                }
                if (this.explanation) {
                    document.getElementById('explanation').textContent = this.explanation;
                }
                if (this.errorMessage) {
                    document.getElementById('errorMessage').textContent = this.errorMessage;
                }
                
                // Show the correct section
                showSection(this.currentSection);
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason') || 'no-session';
    const url = params.get('url');
    const originalUrl = params.get('original_url');
    const domain = params.get('domain');
    const explanation = params.get('explanation');
    
    // Skip if already redirecting
    if (globalRedirectFlag) return;

    // Update state object with URL parameters
    blockPageState.reason = reason;
    blockPageState.url = url;
    blockPageState.originalUrl = originalUrl;
    blockPageState.domain = domain;
    blockPageState.explanation = explanation;
    
    // First try to restore any previous state
    await new Promise(resolve => {
        chrome.storage.local.get(['blockPageState'], (data) => {
            if (data.blockPageState && 
                data.blockPageState.url === url && 
                data.blockPageState.reason === reason) {
                // Only restore if it's the same URL and reason
                blockPageState.restore();
                resolve();
            } else {
                // Otherwise process as new
                resolve();
            }
        });
    });

    // Get session data with context
    const { sessionData } = await chrome.storage.local.get('sessionData');
    
    // Always check session first
    if (!sessionData || sessionData.state !== 'active') {
        showSection('no-session');
        return;
    }

    // Handle different page states
    switch (reason) {
        case 'blocked':
            showSection('blocked');
            displayBlockedInfo(url, explanation || 'This URL is blocked');
            return;
            
        case 'analyzing':
            if (!isAnalyzing) {
                await handleAnalysis(url, originalUrl, domain, sessionData);
            }
            return;
            
        default:
            showSection('no-session');
    }
});

async function handleAnalysis(url, originalUrl, domain, sessionData) {
    isAnalyzing = true;
    showSection('analyzing');
    
    try {
    // Include session start time and search query in cache key
    const searchQuery = extractSearchQuery(url);
    const cacheKey = `${url}-${domain}-${sessionData.startTime}-${searchQuery}`;
    console.debug('[block.js] cacheKey:', cacheKey, { url, domain, sessionStart: sessionData.startTime, searchQuery });
        const cachedResult = sessionStorage.getItem(cacheKey);
        
        // Check if cached result is still valid (less than 1 minute old)
        const now = Date.now();
        const cachedData = cachedResult ? JSON.parse(cachedResult) : null;
        const isCacheValid = cachedData && 
                           cachedData.timestamp && 
                           (now - cachedData.timestamp < 60000);
        
        if (isCacheValid) {
            handleAnalysisResult(cachedData.result, url, originalUrl);
            return;
        }

        const { context } = await chrome.storage.local.get('context');
        const response = await fetch('http://localhost:5000/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: originalUrl,
                domain: domain || sessionData.domain,
                context: context || sessionData.context || [],
                session_id: sessionData.startTime, // Use session start time as ID
                search_query: extractSearchQuery(originalUrl) // Include search query
            })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        console.log('Analysis result:', result);
        
        // Cache result with timestamp
        sessionStorage.setItem(cacheKey, JSON.stringify({
            result,
            timestamp: now
        }));
        console.debug('[block.js] cached analysis result', { cacheKey, result });

        if (result.isProductive && !globalRedirectFlag) {
            globalRedirectFlag = true;
            window.location.replace(originalUrl);
        } else {
            showSection('blocked');
            displayBlockedInfo(url, result.explanation);
            
            // Notify background script about blocked URL
            console.debug('[block.js] sending URL_BLOCKED', {
                url: originalUrl,
                normalizedUrl: normalizeUrl(originalUrl),
                searchQuery: extractSearchQuery(originalUrl),
                reason: result.explanation
            });
            sendMessageSafely({
                type: 'URL_BLOCKED',
                url: originalUrl,
                reason: result.explanation
            });
        }

    } catch (error) {
        console.error('Analysis error:', error);
        showSection('error');
    } finally {
        isAnalyzing = false;
    }
}

function handleAnalysisResult(result, url, originalUrl) {
    if (typeof result === 'object' && 'isProductive' in result) {
        if (result.isProductive) {
            // Mark as allowed and redirect
            sendMessageSafely({
                type: 'URL_ALLOWED',
                url: originalUrl
            }, () => {
                globalRedirectFlag = true;
                window.location.href = originalUrl;
            });
        } else {
            showSection('blocked');
            displayBlockedInfo(url, result.explanation);
            
            // Store both original and normalized URLs
            const searchQuery = extractSearchQuery(originalUrl);
            sendMessageSafely({
                type: 'URL_BLOCKED',
                url: originalUrl,
                normalizedUrl: normalizeUrl(originalUrl),
                reason: result.explanation,
                searchQuery: searchQuery // Include search query in blocked URL data
            });
        }
    } else {
        // Handle legacy format
        if (result) {
            sendMessageSafely({
                type: 'URL_ALLOWED',
                url: originalUrl
            }, () => {
                globalRedirectFlag = true;
                window.location.href = originalUrl;
            });
        } else {
            showSection('blocked');
            displayBlockedInfo(url, "Content not relevant to current task");
            
            sendMessageSafely({
                type: 'URL_BLOCKED',
                url: originalUrl,
                reason: "Content not relevant to current task"
            });
        }
    }
}

// Add search query extraction (same as background.js)
function extractSearchQuery(url) {
    try {
        const urlObj = new URL(url);
        // Handle different search engines
        if (urlObj.hostname.includes('duckduckgo.com')) {
            return urlObj.searchParams.get('q') || '';
        }
        if (urlObj.hostname.includes('google.com')) {
            return urlObj.searchParams.get('q') || '';
        }
        if (urlObj.hostname.includes('bing.com')) {
            return urlObj.searchParams.get('q') || '';
        }
        return '';
    } catch (e) {
        console.error('Search query extraction error:', e);
        return '';
    }
}

// Add URL normalization function (same as background.js)
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // For search engines, include the query in normalization
        const searchQuery = extractSearchQuery(url);
        if (searchQuery) {
            // Include the search query in the normalized URL to ensure each query is unique
            return `${urlObj.origin}?q=${searchQuery}`.toLowerCase();
        }
        // Remove tracking parameters
        urlObj.searchParams.delete('utm_source');
        urlObj.searchParams.delete('utm_medium');
        urlObj.searchParams.delete('utm_campaign');
        // Normalize the URL by lowercasing and removing trailing slash
        return urlObj.toString().toLowerCase().replace(/\/$/, '');
    } catch (e) {
        console.error('URL normalization error:', e);
        return url.toLowerCase();
    }
}

function showSection(sectionId) {
    console.log('Showing section:', sectionId);
    ['no-session', 'analyzing', 'blocked', 'error'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = id === sectionId ? 'block' : 'none';
        }
    });

    // Update container class
    const container = document.querySelector('.block-container');
    if (container) {
        container.classList.toggle('analyzing', sectionId === 'analyzing');
    }
}

function startCountdown(duration) {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;

    const endTime = Date.now() + duration;
    
    function updateCountdown() {
        const timeLeft = Math.max(0, endTime - Date.now());
        
        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
            
            countdownElement.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            countdownElement.textContent = '00:00:00';
            clearInterval(countdownInterval);
        }
    }

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);
}

function displayBlockedInfo(url, explanation, duration) {
    const blockedUrl = document.getElementById('blockedUrl');
    const explanationEl = document.getElementById('explanation');
    
    if (blockedUrl) blockedUrl.textContent = decodeURIComponent(url || '');
    if (explanationEl) explanationEl.textContent = decodeURIComponent(explanation || '');
    if (duration && !isNaN(parseInt(duration))) {
        startCountdown(parseInt(duration));
    }
}

// Timer functionality
async function updateTimer() {
    try {
        const { sessionData } = await chrome.storage.local.get('sessionData');
        if (sessionData?.endTime) {
            const timeLeft = sessionData.endTime - Date.now();
            if (timeLeft > 0) {
                const hours = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
                
                document.getElementById('countdown').textContent = 
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                // Session has expired
                document.getElementById('countdown').textContent = '00:00:00';
                
                // Clear all browser storage types
                sessionStorage.clear();
                localStorage.clear();
                await chrome.storage.local.clear();
                
                // Show no-session section
                showSection('no-session');
                
                // Force reload to no-session state
                if (!window.location.href.includes('reason=no-session')) {
                    window.location.replace(chrome.runtime.getURL('block.html') + 
                        '?reason=no-session' +
                        `&url=${encodeURIComponent(window.location.href)}` +
                        `&original_url=${encodeURIComponent(window.location.href)}`
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error updating timer:', error);
    }
}

// Update timer every second
setInterval(updateTimer, 1000);

// Matrix animation - Enhanced for better visibility
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Initialize
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Matrix characters - More variety
const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?';
const fontSize = 14;
const columns = canvas.width / fontSize;
const drops = new Array(Math.floor(columns)).fill(1);

// Enhanced draw function with more dramatic effects
function draw() {
    // More dramatic fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Multiple green shades for depth
    const colors = ['#0F0', '#0F8', '#4F4', '#8F8', '#AFA'];
    ctx.font = fontSize + 'px "Share Tech Mono", monospace';
    
    for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        
        // Use brighter green and add variety
        const colorIndex = Math.floor(Math.random() * colors.length);
        ctx.fillStyle = colors[colorIndex];
        
        // Add glow effect
        ctx.shadowColor = '#0F0';
        ctx.shadowBlur = 3;
        
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        
        // Reset shadow for next character
        ctx.shadowBlur = 0;
        
        // Random restart with higher frequency
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}

// Faster animation loop for more fluidity
setInterval(draw, 50);
