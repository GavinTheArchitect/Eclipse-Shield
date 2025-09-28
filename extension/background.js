// === DEBUGGING CONFIGURATION ===
const DEBUG_MODE = true;
function debugLog(message, ...args) {
    if (DEBUG_MODE) {
        console.log(`[🔍 DEBUG] ${message}`, ...args);
    }
}

// === BACKGROUND SCRIPT START ===
console.log("[📦] Eclipse Shield background script loaded (Opera version) - " + new Date().toISOString());
debugLog("Background script initialization complete");

// This is an Opera-specific background script that handles new tab detection
// without using chrome_url_overrides which Opera doesn't allow for most extensions

// Add a wrapper function for runtime.sendMessage to handle missing receivers gracefully
function sendMessageSafely(message) {
    try {
        chrome.runtime.sendMessage(message, response => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                // This will happen normally when popup isn't open - don't treat as an error
                console.log('Expected messaging error (receiver likely not active):', lastError.message);
            }
            return response;
        });
    } catch (e) {
        console.log('Failed to send message:', e);
    }
}

// Track analyzing state
let isAnalyzing = false;
let activeUrls = new Set();

// Initialize storage
chrome.storage.local.get(['blockedUrls', 'allowedUrls'], async (data) => {
    if (!data.blockedUrls || !data.allowedUrls) {
        await chrome.storage.local.set({
            blockedUrls: {},
            allowedUrls: {}
        });
        console.log('Initialized URL tracking storage.');
    }
});

// Opera-specific new tab handling - simplified to prevent loops
let redirectedTabs = new Set(); // Track tabs we've already redirected

chrome.tabs.onCreated.addListener((tab) => {
    console.log("[📦] New tab created:", tab);
    
    // Only process if we haven't already redirected this tab
    if (redirectedTabs.has(tab.id)) {
        return;
    }
    
    // Check if this is a browser new tab page (not our extension)
    const isBrowserNewTab = !tab.url || 
                           tab.url === 'chrome://newtab/' || 
                           tab.url === 'opera://startpage/' ||
                           tab.url === 'about:newtab';
    
    // Make sure it's not already our extension page or block page
    const isOurExtension = tab.url && (
        tab.url.startsWith(chrome.runtime.getURL('')) ||
        tab.url.includes('block.html') ||
        tab.url.includes('newtab.html')
    );
    
    debugLog("🔍 New tab check:", {
        isBrowserNewTab,
        isOurExtension,
        url: tab.url,
        isBlockPage: tab.url && tab.url.includes('block.html')
    });
    
    if (isBrowserNewTab && !isOurExtension) {
        debugLog("📦 Detected browser new tab, checking if we should redirect");
        console.log("[📦] Detected browser new tab, redirecting to extension page");
        
        // Wait a bit longer to see if this tab is being handled by navigation listeners
        setTimeout(() => {
            // Check again if this tab hasn't been redirected to a block page
            chrome.tabs.get(tab.id, (currentTab) => {
                if (chrome.runtime.lastError) {
                    debugLog("❌ Tab no longer exists, skipping redirect");
                    return;
                }
                
                const isNowBlockPage = currentTab.url && currentTab.url.includes('block.html');
                const isStillBrowserNewTab = currentTab.url && (
                    !currentTab.url || 
                    currentTab.url === 'chrome://newtab/' || 
                    currentTab.url === 'opera://startpage/' ||
                    currentTab.url === 'about:newtab'
                );
                
                debugLog("🔍 Tab status after delay:", {
                    isNowBlockPage,
                    isStillBrowserNewTab,
                    currentUrl: currentTab.url
                });
                
                // Only redirect if it's still a browser new tab and not a block page
                if (isStillBrowserNewTab && !isNowBlockPage) {
                    debugLog("✅ Proceeding with new tab redirect");
                    // Mark this tab as redirected to prevent loops
                    redirectedTabs.add(tab.id);
                    
                    // Clean up tracking after a delay
                    setTimeout(() => redirectedTabs.delete(tab.id), 5000);
                    
                    // Redirect to our new tab page
                    try {
                        const newTabURL = chrome.runtime.getURL('newtab.html');
                        chrome.tabs.update(tab.id, { url: newTabURL }, (updatedTab) => {
                            if (chrome.runtime.lastError) {
                                console.log("[📦] Could not redirect tab:", chrome.runtime.lastError.message);
                                redirectedTabs.delete(tab.id); // Remove from tracking if failed
                            } else {
                                console.log("[📦] Successfully redirected to custom new tab page");
                            }
                        });
                    } catch (error) {
                        console.log("[📦] Error redirecting tab:", error);
                        redirectedTabs.delete(tab.id); // Remove from tracking if failed
                    }
                } else {
                    debugLog("⏭️ Skipping new tab redirect - tab is being handled elsewhere");
                }
            });
        }, 500); // Increased delay to let navigation handling complete
    }
});

// Clean up when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
    redirectedTabs.delete(tabId);
});

// === CORE BLOCKING FUNCTIONALITY ===
// Block all browsing when no session is active

// Helper function to extract search query from URL
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

// Helper function to normalize URLs for consistent checking
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // For search engines, treat each search independently
        if (urlObj.hostname.includes('google.com') || 
            urlObj.hostname.includes('bing.com') || 
            urlObj.hostname.includes('duckduckgo.com')) {
            // Always force new analysis for search engines
            const searchQuery = extractSearchQuery(url);
            // Generate a unique key for this search
            return `${urlObj.origin}/search/${searchQuery || 'home'}`.toLowerCase();
        }
        // For non-search URLs, remove tracking parameters
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

// Dev helper: log storage lookups and keys
function logLookupInfo(stage, url) {
    try {
        const normalized = normalizeUrl(url);
        const searchQuery = extractSearchQuery(url);
        const compositeKey = searchQuery ? `${normalized}::${searchQuery}` : normalized;
        console.debug(`[background.js] ${stage} - normalized:`, normalized, 'searchQuery:', searchQuery, 'compositeKey:', compositeKey);
        return { normalized, searchQuery, compositeKey };
    } catch (e) {
        console.debug('[background.js] logLookupInfo error', e);
        return { normalized: url, searchQuery: '', compositeKey: url };
    }
}

// Add URL state tracking functions
function isBlockPage(url) {
    try {
        return url.includes(chrome.runtime.id) && url.includes('block.html');
    } catch (e) {
        return false;
    }
}

// Enhanced isExemptUrl function with debugging
function isExemptUrl(url) {
    const exemptDomains = [
        'localhost:5000',
        '127.0.0.1:5000'
    ];
    
    const isExempt = exemptDomains.some(domain => url.includes(domain)) || 
                    url.startsWith('chrome://') || 
                    url.startsWith('chrome-extension://') ||
                    url.startsWith('opera://') ||
                    url.startsWith('about:') ||
                    url.startsWith('file://') ||
                    url === 'about:blank' ||
                    url.includes('localhost:5000') ||
                    isBlockPage(url);
    
    debugLog("🔍 isExemptUrl check:", {
        url,
        isExempt,
        matchedDomains: exemptDomains.filter(domain => url.includes(domain))
    });
    
    return isExempt;
}

// Handle all navigation attempts - block if no active session
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    debugLog("🌐 onBeforeNavigate fired", {
        url: details.url,
        frameId: details.frameId,
        tabId: details.tabId,
        timeStamp: details.timeStamp,
        transitionType: details.transitionType,
        transitionQualifiers: details.transitionQualifiers
    });
    
    // Ignore subframe navigation and non-http(s) protocols
    if (details.frameId !== 0 || !details.url.startsWith('http')) {
        debugLog("❌ Skipping navigation - frameId:", details.frameId, "url:", details.url);
        return;
    }

    debugLog("✅ Processing main frame navigation to:", details.url);

    try {
        debugLog("🔍 Getting storage data for navigation analysis");
        const data = await new Promise(resolve => {
            chrome.storage.local.get(['sessionData', 'blockedUrls', 'allowedUrls'], resolve);
        });

        debugLog("📊 Storage data retrieved:", {
            hasSessionData: !!data.sessionData,
            sessionState: data.sessionData?.state,
            sessionDomain: data.sessionData?.domain,
            blockedUrlsCount: Object.keys(data.blockedUrls || {}).length,
            allowedUrlsCount: Object.keys(data.allowedUrls || {}).length
        });

        console.log('[🛡️] Navigation attempt:', details.url);
        console.log('[🛡️] Session data:', data.sessionData);

        // Check for active session FIRST
        if (!data.sessionData || data.sessionData.state !== 'active') {
            debugLog("❌ No active session found - blocking navigation");
            // No active session, block ALL sites except exempt URLs
            if (!isExemptUrl(details.url)) {
                debugLog("🚫 Redirecting to block page - no session");
                console.log('[🛡️] No active session, blocking navigation:', details.url);
                chrome.tabs.update(details.tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=no-session' +
                        `&url=${encodeURIComponent(details.url)}` +
                        `&original_url=${encodeURIComponent(details.url)}`
                });
                return;
            } else {
                debugLog("✅ URL is exempt, allowing navigation");
            }
        }

        // If there's an active session, analyze the URL for productivity
        if (data.sessionData && data.sessionData.state === 'active') {
            debugLog("✅ Active session found - analyzing URL for productivity");
            console.log('[🛡️] Active session found, analyzing URL:', details.url);
            
            // Skip analysis for exempt URLs
            if (isExemptUrl(details.url)) {
                debugLog("✅ URL is exempt from analysis, allowing");
                console.log('[🛡️] Exempt URL, allowing:', details.url);
                return;
            }
            
            // Skip if this is our block page
            if (details.url.includes(chrome.runtime.id) && details.url.includes('block.html')) {
                debugLog("⏭️ Block page detected, skipping analysis");
                console.log('[🛡️] Block page detected, skipping analysis');
                return;
            }
            
            // Check if URL has already been analyzed
            const normalizedUrl = normalizeUrl(details.url);
            const { blockedUrls = {}, allowedUrls = {} } = data;
            const searchQuery = extractSearchQuery(details.url);
            const compositeKey = searchQuery ? `${normalizedUrl}::${searchQuery}` : normalizedUrl;

            debugLog("🔍 Checking if URL already analyzed:", normalizedUrl);
            debugLog("🔍 Search query:", searchQuery);
            logLookupInfo('onBeforeNavigate - check', details.url);

            if (searchQuery) {
                debugLog("🔍 Processing search query:", searchQuery);
                // Always analyze search queries, even if the domain was previously allowed
                debugLog("🔬 Forcing analysis for search query");
                activeUrls.add(details.url);
                console.log('[🛡️] Redirecting to analysis page for search:', details.url);
                chrome.tabs.update(details.tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=analyzing' +
                        `&url=${encodeURIComponent(details.url)}` +
                        `&original_url=${encodeURIComponent(details.url)}` +
                        `&domain=${encodeURIComponent(data.sessionData.domain)}` +
                        `&context=${encodeURIComponent(JSON.stringify(data.sessionData.context || []))}` +
                        `&search_query=${encodeURIComponent(searchQuery)}`
                });
                return;
            }

            // For non-search URLs, check if blocked (fallback to normalized if composite absent)
            const blockedEntry = blockedUrls[compositeKey] || blockedUrls[normalizedUrl];
            if (blockedEntry) {
                debugLog("🚫 URL is already blocked, redirecting to block page");
                console.log('[🛡️] URL is already blocked:', details.url);
                chrome.tabs.update(details.tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=blocked' +
                        `&url=${encodeURIComponent(details.url)}` +
                        `&original_url=${encodeURIComponent(details.url)}` +
                        `&domain=${encodeURIComponent(data.sessionData.domain)}` +
                        `&explanation=${encodeURIComponent(blockedEntry.reason)}`
                });
                return;
            }

            // Always redirect to analysis page for every navigation/search
            debugLog("🔬 Forcing analysis for every navigation/search");
            activeUrls.add(details.url);
            console.log('[🛡️] Redirecting to analysis page for:', details.url);
            chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL('block.html') + 
                    '?reason=analyzing' +
                    `&url=${encodeURIComponent(details.url)}` +
                    `&original_url=${encodeURIComponent(details.url)}` +
                    `&domain=${encodeURIComponent(data.sessionData.domain)}` +
                    `&context=${encodeURIComponent(JSON.stringify(data.sessionData.context || []))}`
            });
        }
        
    } catch (error) {
        console.error('[🛡️] Error in navigation handler:', error);
        // On error, default to blocking for safety
        if (!isExemptUrl(details.url)) {
            chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL('block.html') + 
                    '?reason=error' +
                    `&url=${encodeURIComponent(details.url)}`
            });
        }
    }
});

// Handle tab updates (when user types in address bar or page redirects)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    debugLog("📝 onUpdated fired", {
        tabId,
        changeInfo,
        tabUrl: tab.url,
        hasUrlChange: !!changeInfo.url,
        status: changeInfo.status
    });
    
    // Only process URL changes
    if (!changeInfo.url || !changeInfo.url.startsWith('http')) {
        debugLog("❌ Skipping tab update - no URL change or non-http:", changeInfo.url);
        return;
    }

    debugLog("✅ Processing tab update to:", changeInfo.url);

    try {
        const data = await new Promise(resolve => {
            chrome.storage.local.get(['sessionData'], resolve);
        });

        console.log('[🛡️] Tab updated to:', changeInfo.url);

        // Check for active session
        if (!data.sessionData || data.sessionData.state !== 'active') {
            // No active session, block ALL sites except exempt URLs
            if (!isExemptUrl(changeInfo.url)) {
                console.log('[🛡️] No active session, blocking tab update:', changeInfo.url);
                chrome.tabs.update(tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=no-session' +
                        `&url=${encodeURIComponent(changeInfo.url)}` +
                        `&original_url=${encodeURIComponent(changeInfo.url)}`
                });
                return;
            }
        } else {
            // Active session - analyze the URL
            console.log('[🛡️] Active session found, analyzing tab update URL:', changeInfo.url);
            
            // Skip analysis for exempt URLs
            if (isExemptUrl(changeInfo.url)) {
                console.log('[🛡️] Exempt URL, allowing tab update:', changeInfo.url);
                return;
            }
            
            // Skip if this is our block page
            if (isBlockPage(changeInfo.url)) {
                console.log('[🛡️] Block page detected in tab update, skipping analysis');
                return;
            }
            
            // Get additional data for analysis
            const analysisData = await new Promise(resolve => {
                chrome.storage.local.get(['blockedUrls', 'allowedUrls'], resolve);
            });
            
            // Check if URL has already been analyzed
            const normalizedUrl = normalizeUrl(changeInfo.url);
            const { blockedUrls = {}, allowedUrls = {} } = analysisData;
            const searchQuery = extractSearchQuery(changeInfo.url);
            const compositeKey = searchQuery ? `${normalizedUrl}::${searchQuery}` : normalizedUrl;

            const blockedEntry = blockedUrls[compositeKey] || blockedUrls[normalizedUrl];
            if (blockedEntry) {
                console.log('[🛡️] Tab update URL is already blocked:', changeInfo.url);
                chrome.tabs.update(tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=blocked' +
                        `&url=${encodeURIComponent(changeInfo.url)}` +
                        `&original_url=${encodeURIComponent(changeInfo.url)}` +
                        `&domain=${encodeURIComponent(data.sessionData.domain)}` +
                        `&explanation=${encodeURIComponent(blockedEntry.reason)}`
                });
                // Send update to popup for blocked URLs
                sendMessageSafely({
                    type: 'URL_ANALYSIS_UPDATE',
                    url: changeInfo.url,
                    action: 'blocked',
                    reason: blockedEntry.reason || 'Blocked by policy'
                });
                return;
            }

            const allowedEntry = allowedUrls[compositeKey] || allowedUrls[normalizedUrl];
            if (allowedEntry) {
                console.log('[🛡️] Tab update URL is already allowed:', changeInfo.url);
                // Send update to popup if needed
                sendMessageSafely({
                    type: 'URL_ANALYSIS_UPDATE',
                    url: changeInfo.url,
                    action: 'allowed',
                    reason: allowedEntry.reason || 'Content is productive'
                });
                return;
            }
            
            // URL hasn't been analyzed yet, redirect to analysis page
            if (!activeUrls.has(changeInfo.url)) {
                activeUrls.add(changeInfo.url);
                console.log('[🛡️] Redirecting tab update to analysis page for:', changeInfo.url);
                chrome.tabs.update(tabId, {
                    url: chrome.runtime.getURL('block.html') + 
                        '?reason=analyzing' +
                        `&url=${encodeURIComponent(changeInfo.url)}` +
                        `&original_url=${encodeURIComponent(changeInfo.url)}` +
                        `&domain=${encodeURIComponent(data.sessionData.domain)}` +
                        `&context=${encodeURIComponent(JSON.stringify(data.sessionData.context || []))}`
                });
            }
        }
        
    } catch (error) {
        console.error('[🛡️] Error in tab update handler:', error);
        // On error, default to blocking for safety
        if (!isExemptUrl(changeInfo.url)) {
            chrome.tabs.update(tabId, {
                url: chrome.runtime.getURL('block.html') + 
                    '?reason=error' +
                    `&url=${encodeURIComponent(changeInfo.url)}`
            });
        }
    }
});

// Function to block all currently open tabs when session ends
function blockAllTabs() {
    // New behavior: create a single block landing tab, then close all other tabs
    console.debug('[background.js] blockAllTabs - creating single block landing tab and closing others');
    chrome.tabs.create({ url: chrome.runtime.getURL('block.html') + '?reason=before-block' }, (newTab) => {
        if (!newTab || !newTab.id) return;
        // Give time for tab to initialize, then close others
        setTimeout(() => {
            chrome.tabs.query({}, (tabs) => {
                const toClose = tabs.filter(t => t.id !== newTab.id).map(t => t.id);
                if (toClose.length) {
                    try {
                        chrome.tabs.remove(toClose);
                        console.debug('[background.js] blockAllTabs - closed tabs:', toClose);
                    } catch (e) {
                        console.error('[background.js] blockAllTabs - error closing tabs', e);
                    }
                }
            });
        }, 300);
    });
}

// Refresh all tabs first, then open single block landing tab and close others
function showBeforeBlockAndCloseAll() {
    console.debug('[background.js] showBeforeBlockAndCloseAll - refreshing all tabs');
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => {
            try { chrome.tabs.reload(t.id); } catch (e) {}
        });
        // After a short delay create the block landing tab and close others
        setTimeout(() => blockAllTabs(), 500);
    });
}

// When session starts, refresh or redirect every tab to the extension new tab page
function activateSessionShowNewTab() {
    console.debug('[background.js] activateSessionShowNewTab - updating all tabs to newtab.html');
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => {
            try {
                // Replace content with extension new tab
                chrome.tabs.update(t.id, { url: chrome.runtime.getURL('newtab.html') });
            } catch (e) {
                console.error('[background.js] activateSessionShowNewTab update error', e);
            }
        });
    });
}

// When session ends, show start/block page and close all other tabs
function endSessionShowStartAndClose() {
    console.debug('[background.js] endSessionShowStartAndClose - creating start block tab and closing others');
    chrome.tabs.create({ url: chrome.runtime.getURL('block.html') + '?reason=no-session' }, (newTab) => {
        if (!newTab || !newTab.id) return;
        setTimeout(() => {
            chrome.tabs.query({}, (tabs) => {
                const toClose = tabs.filter(t => t.id !== newTab.id).map(t => t.id);
                if (toClose.length) chrome.tabs.remove(toClose);
            });
        }, 300);
    });
}

// Listen for session state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.sessionData) {
        const oldSession = changes.sessionData.oldValue;
        const newSession = changes.sessionData.newValue;
        
        console.log('[🛡️] Session state changed:', { oldSession, newSession });
        
        // If session ended or became inactive, block all tabs
        if (oldSession && oldSession.state === 'active' && 
            (!newSession || newSession.state !== 'active')) {
            console.log('[🛡️] Session ended, blocking all tabs');
            blockAllTabs();
        }
    }
});
// Listen for session state changes and act accordingly
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.sessionData) {
        const newSession = changes.sessionData.newValue;
        const oldSession = changes.sessionData.oldValue;
        // If session is starting
        if (newSession && newSession.state === 'active' && (!oldSession || oldSession.state !== 'active')) {
            console.debug('[background.js] session started - activating session view');
            activateSessionShowNewTab();
        }
        // If session ended or became inactive
        if (oldSession && oldSession.state === 'active' && (!newSession || newSession.state !== 'active')) {
            console.debug('[background.js] session ended - showing start block and closing tabs');
            endSessionShowStartAndClose();
        }
    }
});

// On extension startup, check if we should block existing tabs
chrome.runtime.onStartup.addListener(async () => {
    const data = await new Promise(resolve => {
        chrome.storage.local.get(['sessionData'], resolve);
    });
    
    if (!data.sessionData || data.sessionData.state !== 'active') {
        console.log('[🛡️] Extension startup with no active session, blocking all tabs');
        blockAllTabs();
    }
});

// Also check on extension install/enable
chrome.runtime.onInstalled.addListener(async () => {
    const data = await new Promise(resolve => {
        chrome.storage.local.get(['sessionData'], resolve);
    });
    
    if (!data.sessionData || data.sessionData.state !== 'active') {
        console.log('[🛡️] Extension installed/enabled with no active session, blocking all tabs');
        blockAllTabs();
    }
});

// === END BLOCKING FUNCTIONALITY ===

// === ADDITIONAL NAVIGATION DEBUGGING ===
// Listen to all webNavigation events for debugging
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId === 0) {
        debugLog("🏁 Navigation completed:", details.url);
    }
});

chrome.webNavigation.onErrorOccurred.addListener((details) => {
    if (details.frameId === 0) {
        debugLog("❌ Navigation error:", details.url, details.error);
    }
});

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) {
        debugLog("✅ Navigation committed:", details.url, "transitionType:", details.transitionType);
    }
});

// Monitor tab creation
chrome.tabs.onCreated.addListener((tab) => {
    debugLog("➕ New tab created:", {
        id: tab.id,
        url: tab.url,
        openerTabId: tab.openerTabId
    });
});

// Add complete cleanup function
function cleanupAllData() {
    chrome.storage.local.clear(() => {
        console.log('All extension data has been cleared');
        // After clearing data, block all tabs since there's no active session
        blockAllTabs();
    });
    sessionStorage.clear();
    localStorage.clear();
}
