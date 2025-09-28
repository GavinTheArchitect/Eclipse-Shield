// --- Global Scope & Constants ---
const SCRIPT_VERSION = "3.2"; // Rainbow particles, Startpage, Cursor hiding
console.log(`Matrix New Tab v${SCRIPT_VERSION} Initializing...`);

// DOM Element References
let globalSearchBox, searchContainer, contentWrapper, countdownEl, domainEl, timerContainer, cursorRing, cursorDot, customCursorEl, matrixIframe, parallaxContainerElement, textMeasureSpan;

// State Variables
let mouseX, mouseY, frameCounter = 0, isBackspacing = false, placeholderIndex = 0;
let typingInterval = null, backspacingInterval = null, unfocusTimer = null;
let isTyping = false, typingTimerKeyboard = null, lastClickTime = 0;
let cursorVisible = false, isMouseOverDocument = false;
let typingParticleThrottleTimer = null, fireworkThrottleTimer = null;
let currentParticleHue = 120; // Start at green for first particle burst

// --- Configuration ---
const PARALLAX_SENSITIVITY = 0.06;
const PARALLAX_MAX_ROTATE = 18;
const UNFOCUS_DELAY = 3000;
const PLACEHOLDER_TYPE_SPEED = 75;
const PLACEHOLDER_BACKSPACE_SPEED = 45;
const PLACEHOLDER_PAUSE_MS = 1500;
const PLACEHOLDER_CYCLE_DELAY_MS = 200;
const TYPING_PARTICLE_THROTTLE = 50;
const TYPING_PARTICLE_COUNT = 1;
const FIREWORK_PARTICLE_THROTTLE = 60;
const FIREWORK_PARTICLE_COUNT = 12;
const CLICK_PARTICLE_COUNT = 25;
const HUE_INCREMENT_FIREWORK = 10; // Degrees to shift hue per firework burst

const HACKER_CHARS_CLICK = ['0', '1', '#', '*', '[', ']', '{', '}', ';', ':', '%', '$', '&', '+', '-', '=', '?'];
const HACKER_CHARS_TYPING = ['0', '1'];
const HACKER_CHARS_FIREWORK = ['+', '*', ':', ';', '1', '0', '#'];

const PLACEHOLDERS = [
    "Accessing Matrix Search Protocol...", "Establishing Neural Pathways...", "Awaiting User Commands...",
    "Scanning Neural Network...", "Initializing Quantum Interface...", "Connecting to Cyberdeck...",
    "Bypassing Security Protocols...", "Synchronizing Neural Links...", "Loading Reality Matrices...",
    "Calibrating Digital Wavelengths...", "Interfacing with Cyberspace...", "Decrypting Neural Pathways...",
    "Establishing Quantum Entanglement...", "Accessing Deep Web Protocols...", "Initializing AI Constructs...",
    "Loading Virtual Reality Interface...", "Compiling Search Algorithms...", "Hacking the Mainframe...",
    "Recalibrating Digital Synapses...", "Establishing Secure Connection...", "Scanning Dimensional Barriers...",
    "Loading Cybernetic Enhancements...", "Initializing Search Matrix...", "Compiling Data Streams...",
    "Accessing Digital Consciousness...", "Bypassing Neural Firewalls...", "Loading Mind-Machine Interface...",
    "Synchronizing Quantum Processors...", "Establishing Digital Uplink...", "Calculating Search Parameters..."
];

// --- State Management (Chrome Storage) - NO SEARCH VALUE/FOCUS ---
const searchBoxState = {
    placeholderIndex: 0, isTyping: false,
    save: function() { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) { chrome.storage.local.set({ searchBoxState: { placeholderIndex: placeholderIndex, isTyping: isTyping || false } }, () => { if (chrome.runtime.lastError) {} }); } },
    restore: function() { return new Promise((resolve) => { if (globalSearchBox) globalSearchBox.value = ''; if (searchContainer) searchContainer.classList.remove('expanded'); if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) { chrome.storage.local.get(['searchBoxState'], (data) => { if (chrome.runtime.lastError) { placeholderIndex = 0; } else if (data.searchBoxState) { placeholderIndex = data.searchBoxState.placeholderIndex ?? 0; isTyping = data.searchBoxState.isTyping || false; } else { placeholderIndex = 0; } resolve(true); }); } else { placeholderIndex = 0; resolve(true); } }); }
};

// --- Utility Functions ---
const debounce = (func, wait) => { let timeout; return function(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
const getRandomChar = (charSet) => charSet[Math.floor(Math.random() * charSet.length)];
function parseRgb(rgbString) { const match = rgbString?.match(/rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/); return match ? { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) } : { r: 0, g: 255, b: 65 }; }

// --- Search Box Logic ---
function adjustSearchBoxFontSize() { if (!globalSearchBox || !searchContainer || !globalSearchBox.isConnected) return; const input = globalSearchBox; const textToMeasure = (input.value || input.placeholder || ' ').replace('|', ''); const baseFontSize = 60; const dummySpan = textMeasureSpan; if (!dummySpan) return; const computedStyle = window.getComputedStyle(input); dummySpan.style.font = computedStyle.font; dummySpan.style.letterSpacing = computedStyle.letterSpacing; dummySpan.style.paddingLeft = computedStyle.paddingLeft; dummySpan.style.paddingRight = computedStyle.paddingRight; dummySpan.style.textIndent = computedStyle.textIndent; dummySpan.style.textAlign = computedStyle.textAlign; dummySpan.style.fontSize = `${baseFontSize}px`; dummySpan.textContent = textToMeasure || ' '; const textWidthAtBase = dummySpan.offsetWidth; const paddingLeft = parseFloat(computedStyle.paddingLeft); const paddingRight = parseFloat(computedStyle.paddingRight); const availableWidth = input.clientWidth - paddingLeft - paddingRight - 20; if (textWidthAtBase <= 0 || availableWidth <= 0) { input.style.fontSize = ''; input.style.lineHeight = ''; return; } let newFontSize = (availableWidth * baseFontSize) / textWidthAtBase; const minFontSize = 16; const maxFontSize = 90; newFontSize = Math.max(minFontSize, Math.min(newFontSize, maxFontSize)); input.style.fontSize = `${newFontSize}px`; const paddingTop = parseFloat(computedStyle.paddingTop); const paddingBottom = parseFloat(computedStyle.paddingBottom); const innerHeight = input.clientHeight - paddingTop - paddingBottom; input.style.lineHeight = `${Math.ceil(Math.max(innerHeight, newFontSize))}px`; }

// --- Placeholder Cycling ---
function clearPlaceholderIntervals() { clearInterval(typingInterval); clearInterval(backspacingInterval); typingInterval = null; backspacingInterval = null; isBackspacing = false; if (globalSearchBox && globalSearchBox.placeholder.endsWith('|')) { globalSearchBox.placeholder = globalSearchBox.placeholder.slice(0, -1); if(document.activeElement !== globalSearchBox && !globalSearchBox.value) adjustSearchBoxFontSize(); } }
function typePlaceholder(text, cb) { clearPlaceholderIntervals(); if (!globalSearchBox || document.activeElement === globalSearchBox || globalSearchBox.value) return; let typed = ""; typingInterval = setInterval(() => { if (!globalSearchBox || document.activeElement === globalSearchBox || globalSearchBox.value) { clearPlaceholderIntervals(); return; } if (typed.length < text.length) { typed += text[typed.length]; globalSearchBox.placeholder = typed + '|'; adjustSearchBoxFontSize(); } else { clearInterval(typingInterval); typingInterval = null; globalSearchBox.placeholder = typed; adjustSearchBoxFontSize(); searchBoxState.save(); setTimeout(cb, PLACEHOLDER_PAUSE_MS); } }, PLACEHOLDER_TYPE_SPEED); }
function backspacePlaceholder(cb) { clearPlaceholderIntervals(); if (!globalSearchBox || document.activeElement === globalSearchBox || globalSearchBox.value) return; isBackspacing = true; let current = globalSearchBox.placeholder; if (current.length === 0) { isBackspacing = false; cb(); return; } backspacingInterval = setInterval(() => { if (!globalSearchBox || document.activeElement === globalSearchBox || globalSearchBox.value) { clearPlaceholderIntervals(); return; } current = globalSearchBox.placeholder.replace('|', ''); if (current.length > 0) { const newText = current.slice(0, -1); globalSearchBox.placeholder = newText + '|'; adjustSearchBoxFontSize(); } else { clearInterval(backspacingInterval); backspacingInterval = null; isBackspacing = false; globalSearchBox.placeholder = ''; adjustSearchBoxFontSize(); searchBoxState.save(); cb(); } }, PLACEHOLDER_BACKSPACE_SPEED); }
function cyclePlaceholders() { clearPlaceholderIntervals(); if (!globalSearchBox || document.activeElement === globalSearchBox || globalSearchBox.value) return; const currentPlaceholder = PLACEHOLDERS[placeholderIndex]; typePlaceholder(currentPlaceholder, () => { backspacePlaceholder(() => { placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length; setTimeout(cyclePlaceholders, PLACEHOLDER_CYCLE_DELAY_MS); }); }); }
function ensurePlaceholdersActive() { if (globalSearchBox && globalSearchBox.isConnected && document.activeElement !== globalSearchBox && !globalSearchBox.value) { if (!typingInterval && !backspacingInterval) { globalSearchBox.style.fontSize = ''; globalSearchBox.style.lineHeight = ''; cyclePlaceholders(); } } else { clearPlaceholderIntervals(); } }

// --- Effects ---
function createRipple(e, isMini = false) { const ripple = document.createElement("div"); ripple.className = "ripple" + (isMini ? " mini-ripple" : ""); document.body.appendChild(ripple); ripple.style.left = `${e.clientX}px`; ripple.style.top = `${e.clientY}px`; ripple.addEventListener("animationend", () => ripple.remove()); }
function createEmpPulse(e, colorString = 'rgb(120, 220, 255)') { const pulse = document.createElement("div"); pulse.className = "emp-pulse"; const colorRgb = parseRgb(colorString); const r = colorRgb?.r ?? 120; const g = colorRgb?.g ?? 220; const b = colorRgb?.b ?? 255; pulse.style.background = `rgba(${r}, ${g}, ${b}, 0.8)`; pulse.style.boxShadow = `0 0 15px 8px rgba(${r}, ${g}, ${b}, 0.6), 0 0 30px 15px rgba(${r}, ${g}, ${b}, 0.4)`; document.body.appendChild(pulse); pulse.style.left = `${e.clientX}px`; pulse.style.top = `${e.clientY}px`; pulse.addEventListener("animationend", () => pulse.remove()); }
function createClickShockwave(e, colorString = 'rgb(0, 255, 65)') { const shockwave = document.createElement("div"); shockwave.className = "click-shockwave"; const colorRgb = parseRgb(colorString); shockwave.style.borderColor = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`; shockwave.style.background = `radial-gradient(ellipse at center, rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.05) 0%, rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.15) 30%, transparent 70%)`; shockwave.style.boxShadow = `0 0 20px rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.3), inset 0 0 15px rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.2)`; document.body.appendChild(shockwave); shockwave.style.left = `${e.clientX}px`; shockwave.style.top = `${e.clientY}px`; shockwave.addEventListener("animationend", () => shockwave.remove()); }
function createDigitalBurstOnClick(e, colorString = 'rgb(0, 255, 65)') { const baseColorRgb = parseRgb(colorString); for (let i = 0; i < CLICK_PARTICLE_COUNT; i++) { const particle = document.createElement('div'); particle.className = 'digital-particle'; particle.textContent = getRandomChar(HACKER_CHARS_CLICK); document.body.appendChild(particle); const angle = Math.random() * Math.PI * 2; const velocity = 60 + Math.random() * 100; const lifetime = 0.6 + Math.random() * 0.6; const finalScale = 0.2 + Math.random() * 0.5; const rotation = (Math.random() - 0.5) * 720; particle.style.color = `rgb(${baseColorRgb.r}, ${baseColorRgb.g}, ${baseColorRgb.b})`; particle.style.textShadow = `0 0 6px rgba(${baseColorRgb.r}, ${baseColorRgb.g}, ${baseColorRgb.b}, 0.7)`; particle.style.left = `${e.clientX}px`; particle.style.top = `${e.clientY}px`; particle.style.fontSize = `${0.9 + Math.random() * 0.6}em`; particle.style.transition = `transform ${lifetime}s cubic-bezier(0.1, 0.8, 0.2, 1), opacity ${lifetime}s ease-out`; requestAnimationFrame(() => { particle.style.transform = `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) scale(${finalScale}) rotate(${rotation}deg)`; particle.style.opacity = '0'; }); setTimeout(() => particle.remove(), lifetime * 1000); } }
function createTypingParticle(x, y, hue) { const particle = document.createElement('div'); particle.className = 'typing-particle'; particle.textContent = getRandomChar(HACKER_CHARS_TYPING); document.body.appendChild(particle); particle.style.left = `${x}px`; particle.style.top = `${y}px`; particle.style.color = `hsl(${hue}, 100%, 75%)`; const angle = (Math.random() - 0.5) * Math.PI * 0.8 - Math.PI / 2; const velocity = 15 + Math.random() * 20; const lifetime = 0.3 + Math.random() * 0.4; const finalScale = 0.5 + Math.random() * 0.4; particle.style.transition = `transform ${lifetime}s ease-out, opacity ${lifetime*0.8}s ease-in`; requestAnimationFrame(() => { particle.style.transform = `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) scale(${finalScale})`; particle.style.opacity = '0'; }); setTimeout(() => particle.remove(), lifetime * 1000); }
// Firework Particle Effect (uses HSL color)
function createCharacterFirework(x, y, hue) { for (let i = 0; i < FIREWORK_PARTICLE_COUNT; i++) { const particle = document.createElement('div'); particle.className = 'firework-particle'; particle.textContent = getRandomChar(HACKER_CHARS_FIREWORK); document.body.appendChild(particle); const angle = Math.random() * Math.PI * 2; const velocity = 20 + Math.random() * 40; const lifetime = 0.4 + Math.random() * 0.5; const finalScale = 0.1 + Math.random() * 0.3; const rotation = (Math.random() - 0.5) * 360; particle.style.left = `${x}px`; particle.style.top = `${y}px`; particle.style.fontSize = `${0.8 + Math.random() * 0.4}em`; const currentHue = (hue + (Math.random() - 0.5) * 20) % 360; // Slight hue variation per particle
         particle.style.color = `hsl(${currentHue}, 100%, ${70 + Math.random() * 30}%)`; particle.style.textShadow = `0 0 6px hsla(${currentHue}, 100%, 60%, 0.7)`; particle.style.transition = `transform ${lifetime}s cubic-bezier(0.1, 0.8, 0.5, 1), opacity ${lifetime}s ease-out`; requestAnimationFrame(() => { particle.style.transform = `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) scale(${finalScale}) rotate(${rotation}deg)`; particle.style.opacity = '0'; }); setTimeout(() => particle.remove(), lifetime * 1000); } }

// Get Specific Character Position
function getCharacterXY(charIndex) { if (!globalSearchBox || !textMeasureSpan || !globalSearchBox.isConnected || charIndex < 0) return null; const input = globalSearchBox; const span = textMeasureSpan; const value = input.value; if (charIndex >= value.length) return null; const computedStyle = window.getComputedStyle(input); span.style.font = computedStyle.font; span.style.letterSpacing = computedStyle.letterSpacing; span.style.paddingLeft = computedStyle.paddingLeft; span.style.paddingRight = computedStyle.paddingRight; span.style.textIndent = computedStyle.textIndent; span.style.textAlign = computedStyle.textAlign; span.style.fontSize = computedStyle.fontSize; const textBeforeTargetChar = value.substring(0, charIndex).replace(/ /g, '\u00a0'); const textWithTargetChar = value.substring(0, charIndex + 1).replace(/ /g, '\u00a0'); span.textContent = textBeforeTargetChar || '\u00a0'; const widthBefore = span.offsetWidth; span.textContent = textWithTargetChar || '\u00a0'; const widthWithChar = span.offsetWidth; const inputRect = input.getBoundingClientRect(); const charWidth = widthWithChar - widthBefore; const charMidPointOffset = charWidth / 2; let charCenterX; if (computedStyle.textAlign === 'center') { const fullText = value.replace(/ /g, '\u00a0') || '\u00a0'; span.textContent = fullText; const fullTextWidth = span.offsetWidth; const inputCenterX = inputRect.left + inputRect.width / 2; const textStartX = inputCenterX - fullTextWidth / 2; charCenterX = textStartX + widthBefore + charMidPointOffset; } else { const paddingLeft = parseFloat(computedStyle.paddingLeft); const textStartX = inputRect.left + paddingLeft; charCenterX = textStartX + widthBefore + charMidPointOffset; } const charCenterY = inputRect.top + (inputRect.height / 2); span.textContent = ''; return { x: charCenterX, y: charCenterY }; }

// --- Event Handlers Setup ---
function setupEventListeners() {
    document.addEventListener('keydown', (e) => { const target = e.target; const tagName = target.tagName.toLowerCase(); if ((tagName === 'input' || tagName === 'textarea') && target !== globalSearchBox) return; if (e.metaKey || e.ctrlKey || e.altKey || ['Tab','Enter','Escape','Shift','Control','Alt','Meta','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'].includes(e.key)) return; if (globalSearchBox && document.activeElement !== globalSearchBox) { if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') { clearPlaceholderIntervals(); globalSearchBox.focus(); } } isBackspacing = (e.key === 'Backspace'); });
    // Keyup handles auto-unfocus
    document.addEventListener('keyup', (e) => { if (e.key === 'Backspace') { isBackspacing = false; if (globalSearchBox && globalSearchBox.value === '' && document.activeElement === globalSearchBox) { globalSearchBox.blur(); } else if (globalSearchBox && !globalSearchBox.value && document.activeElement !== globalSearchBox) { ensurePlaceholdersActive(); } } });

    if (globalSearchBox && searchContainer) {
        globalSearchBox.addEventListener('focus', () => { searchContainer.classList.add('expanded'); clearTimeout(unfocusTimer); clearPlaceholderIntervals(); adjustSearchBoxFontSize(); });
        globalSearchBox.addEventListener('blur', () => { searchContainer.classList.remove('expanded'); stopTypingAnimation(); if (!globalSearchBox.value) { globalSearchBox.style.fontSize = ''; globalSearchBox.style.lineHeight = ''; setTimeout(ensurePlaceholdersActive, 50); } else { adjustSearchBoxFontSize(); } });
        // Input handler for particles
        globalSearchBox.addEventListener('input', (e) => { if (!searchContainer.classList.contains('expanded')) searchContainer.classList.add('expanded'); adjustSearchBoxFontSize(); startTypingAnimation(); clearTimeout(unfocusTimer); if (globalSearchBox.value !== '') { if (e.inputType && (e.inputType.includes('insertText') || e.inputType.includes('insertCompositionText'))) { if (!fireworkThrottleTimer) { const charIndex = (globalSearchBox.selectionStart ?? globalSearchBox.value.length) - 1; const charPos = getCharacterXY(charIndex); if (charPos) { createCharacterFirework(charPos.x, charPos.y, currentParticleHue); currentParticleHue = (currentParticleHue + HUE_INCREMENT_FIREWORK) % 360; } fireworkThrottleTimer = setTimeout(() => { fireworkThrottleTimer = null; }, FIREWORK_PARTICLE_THROTTLE); } } } });
        globalSearchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Tab') return; globalSearchBox.classList.remove('active'); void globalSearchBox.offsetWidth; globalSearchBox.classList.add('active'); setTimeout(() => { if (globalSearchBox && globalSearchBox.isConnected) globalSearchBox.classList.remove('active'); }, 180); });
        const startUnfocusTimer = () => { clearTimeout(unfocusTimer); if (UNFOCUS_DELAY > 0 && document.activeElement === globalSearchBox && !globalSearchBox.value) { unfocusTimer = setTimeout(() => { if (document.activeElement === globalSearchBox && !globalSearchBox.value) globalSearchBox.blur(); }, UNFOCUS_DELAY); } };
        globalSearchBox.addEventListener('keyup', () => { if (!globalSearchBox.value) startUnfocusTimer(); });
        searchContainer.addEventListener('mouseleave', () => { if (!globalSearchBox.value && document.activeElement === globalSearchBox) startUnfocusTimer(); });
        searchContainer.addEventListener('mouseenter', () => clearTimeout(unfocusTimer));
    }

    // Search Form Submission (uses DuckDuckGo) - Optimized for speed
    const searchForm = document.getElementById('searchForm');
    if (searchForm) { 
        searchForm.addEventListener('submit', (e) => { 
            e.preventDefault(); 
            const query = globalSearchBox ? globalSearchBox.value.trim() : null; 
            if (query) { 
                // Pre-construct the search URL for faster redirect
                const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`; 
                
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) { 
                    chrome.storage.local.get(['sessionData'], (data) => { 
                        if (chrome.runtime.lastError || !(data.sessionData?.state === 'active' && (!data.sessionData.endTime || data.sessionData.endTime > Date.now()))) { 
                            triggerShakeAndFlash(); 
                        } else { 
                            // Immediate redirect - don't wait for anything
                            window.location.replace(searchUrl); // Use replace() for faster redirect
                        } 
                    }); 
                } else { 
                    triggerShakeAndFlash(); 
                } 
            } else { 
                triggerShakeAndFlash(); 
            } 
        }); 
    }
    function triggerShakeAndFlash() { if(searchContainer && searchContainer.isConnected) { const currentTransform = window.getComputedStyle(searchContainer).transform; searchContainer.style.setProperty('--current-transform', currentTransform === 'none' ? 'translateZ(5px)' : currentTransform); searchContainer.classList.add('shake'); setTimeout(() => { if (searchContainer && searchContainer.isConnected) { searchContainer.classList.remove('shake'); searchContainer.style.removeProperty('--current-transform'); } }, 500); } if (timerContainer && timerContainer.isConnected) { timerContainer.style.transition = 'opacity 0.1s, filter 0.1s'; timerContainer.style.filter = 'hue-rotate(-90deg) saturate(5)'; setTimeout(() => { if (timerContainer && timerContainer.isConnected) timerContainer.style.filter = ''; }, 200); } }

    document.addEventListener('mousemove', (e) => { if (!isMouseOverDocument) isMouseOverDocument = true; mouseX = e.clientX; mouseY = e.clientY; if (customCursorEl && customCursorEl.isConnected) { if (!cursorVisible) { customCursorEl.style.opacity = '1'; cursorVisible = true; } if (cursorRing) { cursorRing.style.left = `${mouseX}px`; cursorRing.style.top = `${mouseY}px`; } if (cursorDot) { cursorDot.style.left = `${mouseX}px`; cursorDot.style.top = `${mouseY}px`; } } if (parallaxContainerElement && parallaxContainerElement.isConnected) { const centerX = window.innerWidth / 2; const centerY = window.innerHeight / 2; const deltaX = mouseX - centerX; const deltaY = mouseY - centerY; const rotateX = -deltaY * PARALLAX_SENSITIVITY; const rotateY = deltaX * PARALLAX_SENSITIVITY; const clampedRotateX = Math.max(-PARALLAX_MAX_ROTATE, Math.min(PARALLAX_MAX_ROTATE, rotateX)); const clampedRotateY = Math.max(-PARALLAX_MAX_ROTATE, Math.min(PARALLAX_MAX_ROTATE, rotateY)); requestAnimationFrame(() => { if (parallaxContainerElement && parallaxContainerElement.isConnected) parallaxContainerElement.style.transform = `rotateX(${clampedRotateX}deg) rotateY(${clampedRotateY}deg) translateZ(0px)`; }); } });
    document.addEventListener('mouseenter', () => { isMouseOverDocument = true; if (customCursorEl && customCursorEl.isConnected && !cursorVisible) { customCursorEl.style.opacity = '1'; cursorVisible = true; } });
    document.addEventListener('mouseleave', () => { isMouseOverDocument = false; if (parallaxContainerElement && parallaxContainerElement.isConnected) parallaxContainerElement.style.transform = 'rotateY(0deg) rotateX(0deg) translateZ(0px)'; if (customCursorEl && customCursorEl.isConnected) { customCursorEl.style.opacity = '0'; cursorVisible = false; } mouseX = undefined; mouseY = undefined; });

    // Click Listener - Passes color to EMP Pulse too
    document.addEventListener('click', (e) => { const now = performance.now(); if (now - lastClickTime < 150) return; lastClickTime = now; let currentRingColor = 'rgb(0, 255, 65)'; if (cursorRing && cursorRing.isConnected) { try { currentRingColor = window.getComputedStyle(cursorRing).borderColor || currentRingColor; } catch (err) {} } createClickShockwave(e, currentRingColor); createEmpPulse(e, currentRingColor); createDigitalBurstOnClick(e, currentRingColor); for (let i = 0; i < 3; i++) createRipple(e, true); const clickedElements = document.elementsFromPoint(e.clientX, e.clientY); clickedElements.forEach(el => { const targetElement = el.classList.contains('glitch-text') ? el : (el.closest('.glitch-text') || el.closest('.search-container')); if(targetElement){ targetElement.classList.remove('glitch-click'); void targetElement.offsetWidth; targetElement.classList.add('glitch-click'); setTimeout(() => { if (targetElement && targetElement.isConnected) targetElement.classList.remove('glitch-click'); }, 400); } }); });

    const debouncedResize = debounce(() => { adjustSearchBoxFontSize(); }, 250); window.addEventListener('resize', debouncedResize);

    let ringAnimationRequest = null; function updateRingEffect() { if (!cursorRing || !cursorRing.isConnected) { if (ringAnimationRequest) cancelAnimationFrame(ringAnimationRequest); return; } const time = Date.now() * 0.0015; const r = Math.sin(time) * 100 + 155; const g = Math.sin(time + Math.PI * 2/3) * 100 + 155; const b = Math.sin(time + Math.PI * 4/3) * 100 + 155; const colorString = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`; cursorRing.style.borderColor = colorString; cursorRing.style.boxShadow = `0 0 10px ${colorString}, 0 0 20px rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, 0.5)`; const scale = 1 + Math.sin(time * 2.5) * 0.08; cursorRing.style.transform = `translate(-50%, -50%) scale(${scale})`; ringAnimationRequest = requestAnimationFrame(updateRingEffect); } if (cursorRing) ringAnimationRequest = requestAnimationFrame(updateRingEffect);

    // Typing Animation Control (for RGB border)
    const startTypingAnimation = () => { if (!isTyping && globalSearchBox && globalSearchBox.isConnected) { isTyping = true; globalSearchBox.classList.add('typing'); } clearTimeout(typingTimerKeyboard); typingTimerKeyboard = setTimeout(() => { stopTypingAnimation(); }, 400); };
    const stopTypingAnimation = () => { isTyping = false; clearTimeout(typingTimerKeyboard); if (globalSearchBox && globalSearchBox.isConnected) { globalSearchBox.classList.remove('typing'); } };
}

// --- Timer Update Function ---
async function updateTimer() { if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) { if (timerContainer && timerContainer.isConnected) timerContainer.classList.remove('active'); return; } try { const { sessionData } = await chrome.storage.local.get('sessionData'); if (chrome.runtime.lastError) return; if (!timerContainer || !countdownEl || !domainEl || !timerContainer.isConnected) return; if (sessionData?.state === 'active' && sessionData?.endTime && sessionData.endTime > Date.now()) { if (!timerContainer.classList.contains('active')) timerContainer.classList.add('active'); const timeLeft = sessionData.endTime - Date.now(); const h = Math.floor(timeLeft / 3600000).toString().padStart(2, '0'); const m = Math.floor((timeLeft % 3600000) / 60000).toString().padStart(2, '0'); const s = Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, '0'); const timeString = `${h}:${m}:${s}`; if (countdownEl.textContent !== timeString) { countdownEl.textContent = timeString; countdownEl.setAttribute('data-text', timeString); } const domainString = sessionData.domain?.toUpperCase() || '---'; if (domainEl.textContent !== domainString) { domainEl.textContent = domainString; domainEl.setAttribute('data-text', domainString); } } else { if (timerContainer.classList.contains('active')) timerContainer.classList.remove('active'); const isExpired = (sessionData?.state === 'expired' || (sessionData?.endTime && sessionData.endTime <= Date.now())); const inactiveTime = isExpired ? "00:00:00" : "--:--:--"; const inactiveDomain = isExpired ? "SESSION EXPIRED" : "---"; if (countdownEl.textContent !== inactiveTime) { countdownEl.textContent = inactiveTime; countdownEl.setAttribute('data-text', inactiveTime); } if (domainEl.textContent !== inactiveDomain) { domainEl.textContent = inactiveDomain; domainEl.setAttribute('data-text', inactiveDomain); } } } catch (error) { console.error("Error updating timer:", error); } }

// --- Matrix Background ---
function initializeMatrixBackground() { matrixIframe = document.getElementById('matrix-iframe'); if (!matrixIframe) return; matrixIframe.onerror = () => { if(matrixIframe) matrixIframe.style.display = 'none'; }; matrixIframe.onload = () => {}; }
window.addEventListener('message', (event) => { if (event.data && event.data.type === 'matrix-sandbox' && event.data.status === 'ready') {} });

// --- Initialization ---
async function initializeApp() {
    console.log(`DOM Loaded. Initializing App v${SCRIPT_VERSION}...`); initializeMatrixBackground();
    globalSearchBox = document.getElementById('searchQuery'); searchContainer = document.querySelector('.search-container'); contentWrapper = document.querySelector('.content-wrapper'); countdownEl = document.getElementById('countdown'); domainEl = document.getElementById('activeDomain'); timerContainer = document.querySelector('.timer-container'); cursorRing = document.querySelector('.cursor-ring'); cursorDot = document.querySelector('.cursor-dot'); customCursorEl = document.querySelector('.custom-cursor'); parallaxContainerElement = document.querySelector('.parallax-container'); textMeasureSpan = document.getElementById('text-measure-span');
    if (!globalSearchBox || !searchContainer || !parallaxContainerElement || !textMeasureSpan) { console.error("CRITICAL ERROR: Essential UI elements not found."); document.body.innerHTML = '<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: #000500; color: #ff4444; font-family: monospace; font-size: 1.5em; text-align: center; padding: 2em; z-index: 10000;">ERROR: UI Components Failed to Load.<br>Please check console or try reloading.</div>'; return; }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs) { 
        try { 
            const { sessionData } = await chrome.storage.local.get('sessionData'); 
            if (!chrome.runtime.lastError && (!sessionData || sessionData.state !== 'active' || (sessionData.endTime && sessionData.endTime < Date.now()))) { 
                console.log('ℹ️ Newtab: No active session detected - redirecting to block page (this is normal behavior)'); 
                // Redirect to block page like it was before
                window.location.href = chrome.runtime.getURL('block.html') + 
                    '?reason=no-session' + 
                    '&url=' + encodeURIComponent(window.location.href) + 
                    '&original_url=' + encodeURIComponent(window.location.href);
                return; 
            } 
        } catch (error) { 
            console.error('Error checking session state:', error); 
            // Redirect to block page on error too
            window.location.href = chrome.runtime.getURL('block.html') + 
                '?reason=session-error' + 
                '&url=' + encodeURIComponent(window.location.href) + 
                '&original_url=' + encodeURIComponent(window.location.href);
            return; 
        } 
    }
    setupEventListeners(); updateTimer(); setInterval(updateTimer, 1000);
    await searchBoxState.restore(); // Restore placeholder index only
    setTimeout(() => { if (globalSearchBox && globalSearchBox.isConnected) adjustSearchBoxFontSize(); ensurePlaceholdersActive(); if (!isMouseOverDocument && parallaxContainerElement && parallaxContainerElement.isConnected) parallaxContainerElement.style.transform = 'rotateY(0deg) rotateX(0deg) translateZ(0px)'; }, 100);
    console.log(`App Initialization Complete (v${SCRIPT_VERSION}).`);
}
document.addEventListener('DOMContentLoaded', initializeApp);