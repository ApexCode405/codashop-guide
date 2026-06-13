document.addEventListener("DOMContentLoaded", () => {
    // ---------- STATE ----------
    const state = {
        theme: "dark",
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        scrollPos: 0,
        mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
        gyro: { alpha: 0, beta: 0, gamma: 0 },
        canvas: { width: window.innerWidth, height: window.innerHeight }
    };

    // ---------- DOM ----------
    const DOM = {
        body: document.body,
        themeBtns: document.querySelectorAll(".theme-btn"),
        progressFill: document.querySelector(".nav-progress-fill"),
        tiltElements: document.querySelectorAll(".tilt-effect"),
        copyables: document.querySelectorAll(".copyable"),
        stepCards: document.querySelectorAll(".step-card"),
        nav: document.querySelector(".top-nav"),
        canvas: document.getElementById("ambient-canvas"),
        dynamicValue: document.querySelector(".dynamic-value"),
        particleCanvas: document.getElementById("particle-canvas")
    };

    // ---------- CONFIG ----------
    const config = {
        springFactor: 0.1,
        friction: 0.8,
        tiltMax: 15,
        toastDuration: 3000,
        numberAnimDuration: 2000,
        particleCountFactor: 9000
    };

    // ---------- UTILS ----------
    class Utils {
        static lerp(start, end, amt) {
            return (1 - amt) * start + amt * end;
        }
        static clamp(val, min, max) {
            return Math.min(Math.max(val, min), max);
        }
        static generateId() {
            return Math.random().toString(36).substr(2, 9);
        }
        static formatCurrency(num) {
            return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(num);
        }
    }

    // ---------- TOAST ----------
    class ToastSystem {
        constructor() {
            this.container = document.getElementById("toast-container");
            if (!this.container) {
                this.container = document.createElement("div");
                this.container.id = "toast-container";
                this.container.innerHTML = `
                    <div class="toast-glow"></div>
                    <div class="toast-content">
                        <div class="toast-icon-wrapper">
                            <svg class="toast-check-icon" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                            </svg>
                        </div>
                        <div class="toast-text-wrapper">
                            <span class="toast-title">Başarılı</span>
                            <span class="toast-message" id="toast-msg">İşlem tamamlandı.</span>
                        </div>
                    </div>`;
                document.body.appendChild(this.container);
            }
            this.msgElement = this.container.querySelector("#toast-msg");
            this.timeout = null;
        }

        show(message, type = "success") {
            clearTimeout(this.timeout);
            if (this.msgElement) this.msgElement.textContent = message;

            this.container.classList.remove("toast-hidden");
            this.container.classList.add("toast-visible");

            this.timeout = setTimeout(() => {
                this.container.classList.remove("toast-visible");
                this.container.classList.add("toast-hidden");
            }, config.toastDuration);
        }
    }

    const toast = new ToastSystem();

    // ---------- THEME ----------
    function getParticleColors() {
        const style = getComputedStyle(document.body);
        return {
            node: style.getPropertyValue('--accent-primary').trim() || '#2563eb',
            line: style.getPropertyValue('--accent-secondary').trim() || '#0ea5e9'
        };
    }

    function applyTheme(themeName) {
        DOM.body.classList.remove("theme-light", "theme-dark", "theme-oled");
        DOM.body.classList.add("theme-" + themeName);
        state.theme = themeName;
        localStorage.setItem("appTheme", themeName);

        DOM.themeBtns.forEach(btn => {
            btn.classList.toggle("active-theme", btn.dataset.theme === themeName);
        });

        if (window.particleNetwork) {
            const colors = getParticleColors();
            window.particleNetwork.updateColors(colors.node, colors.line);
        }
    }

    function initTheme() {
        let saved = localStorage.getItem("appTheme");
        if (saved && saved.startsWith("theme-")) {
            saved = saved.replace("theme-", "");
        }
        const initialTheme = saved || "dark";
        applyTheme(initialTheme);

        DOM.themeBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const newTheme = e.currentTarget.dataset.theme;
                if (state.theme !== newTheme) {
                    applyTheme(newTheme);
                    triggerThemeTransitionEffect(e.clientX, e.clientY);
                }
            });
        });
    }

    function triggerThemeTransitionEffect(x, y) {
        const ripple = document.createElement("div");
        ripple.style.position = "fixed";
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.style.width = "0px";
        ripple.style.height = "0px";
        ripple.style.borderRadius = "50%";
        ripple.style.backgroundColor = "var(--accent-primary)";
        ripple.style.opacity = "0.5";
        ripple.style.pointerEvents = "none";
        ripple.style.zIndex = "9999";
        ripple.style.transform = "translate(-50%, -50%)";
        ripple.style.transition = "width 1s ease-out, height 1s ease-out, opacity 1s ease-out";
        
        document.body.appendChild(ripple);
        
        requestAnimationFrame(() => {
            ripple.style.width = "300vw";
            ripple.style.height = "300vw";
            ripple.style.opacity = "0";
        });
        
        setTimeout(() => ripple.remove(), 1000);
    }

    // ---------- SCROLL ----------
    function initScrollEngine() {
        window.addEventListener("scroll", () => {
            state.scrollPos = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = (state.scrollPos / docHeight) * 100;
            
            if (DOM.progressFill) {
                DOM.progressFill.style.width = `${scrollPercent}%`;
            }

            if (state.scrollPos > 50) {
                DOM.nav.style.boxShadow = "var(--shadow-md)";
                DOM.nav.style.background = "var(--bg-overlay)";
            } else {
                DOM.nav.style.boxShadow = "none";
                DOM.nav.style.background = "var(--bg-glass)";
            }
        }, { passive: true });
    }

    // ---------- TILT ----------
    function initTiltPhysics() {
        if (!DOM.tiltElements.length) return;

        if (state.isMobile && window.DeviceOrientationEvent) {
            window.addEventListener("deviceorientation", (e) => {
                state.gyro.beta = Utils.clamp(e.beta, -45, 45);
                state.gyro.gamma = Utils.clamp(e.gamma, -45, 45);
                
                const rotateX = (state.gyro.beta / 45) * config.tiltMax;
                const rotateY = (state.gyro.gamma / 45) * config.tiltMax;

                DOM.tiltElements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.top < window.innerHeight && rect.bottom > 0) {
                        el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                    }
                });
            }, true);
        } else {
            DOM.tiltElements.forEach(el => {
                let rect, centerX, centerY;

                el.addEventListener("mouseenter", () => {
                    rect = el.getBoundingClientRect();
                    centerX = rect.left + rect.width / 2;
                    centerY = rect.top + rect.height / 2;
                    el.style.transition = "transform 0.1s ease-out";
                });

                el.addEventListener("mousemove", (e) => {
                    rect = el.getBoundingClientRect();
                    centerX = rect.left + rect.width / 2;
                    centerY = rect.top + rect.height / 2;
                    
                    const mouseX = e.clientX - centerX;
                    const mouseY = e.clientY - centerY;
                    
                    const rotateX = ((mouseY / (rect.height / 2)) * -config.tiltMax).toFixed(2);
                    const rotateY = ((mouseX / (rect.width / 2)) * config.tiltMax).toFixed(2);
                    
                    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                });

                el.addEventListener("mouseleave", () => {
                    el.style.transition = "transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
                    el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
                });
            });
        }
    }

    // ---------- OBSERVER ----------
    function initObserver() {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15
        };

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationPlayState = "running";
                    entry.target.style.opacity = "1";
                    entry.target.style.transform = "translateY(0)";
                    obs.unobserve(entry.target);
                    
                    if (entry.target.classList.contains("dynamic-payment-box")) {
                        animateDynamicValue();
                    }
                }
            });
        }, observerOptions);

        DOM.stepCards.forEach(card => {
            card.style.animationPlayState = "paused";
            observer.observe(card);
        });

        const paymentBox = document.querySelector(".dynamic-payment-box");
        if (paymentBox) observer.observe(paymentBox);
    }

    // ---------- COPY SYSTEM ----------
    function initCopyLogic() {
        DOM.copyables.forEach(item => {
            item.addEventListener("click", async (e) => {
                const textToCopy = e.target.getAttribute("data-copy") || e.target.innerText;
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    
                    const originalText = e.target.innerText;
                    e.target.innerText = "Kopyalandı!";
                    e.target.style.background = "var(--success-color)";
                    e.target.style.color = "var(--bg-primary)";
                    
                    toast.show("Metin panoya başarıyla kopyalandı.");
                    
                    createParticles(e.clientX, e.clientY);
                    
                    setTimeout(() => {
                        e.target.innerText = originalText;
                        e.target.style.background = "";
                        e.target.style.color = "";
                    }, 2000);
                } catch (err) {
                    toast.show("Kopyalama başarısız oldu!", "error");
                }
            });
        });
    }

    // ---------- DYNAMIC VALUE ----------
    function animateDynamicValue() {
        if (!DOM.dynamicValue) return;

        const targetAttr = DOM.dynamicValue.getAttribute("data-target");
        if (targetAttr === null || isNaN(parseFloat(targetAttr))) {
            return;
        }

        const targetValue = parseFloat(targetAttr);
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / config.numberAnimDuration, 1);
            
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const currentValue = Utils.lerp(0, targetValue, easeOutQuart);
            
            DOM.dynamicValue.textContent = Utils.formatCurrency(currentValue);
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                DOM.dynamicValue.textContent = Utils.formatCurrency(targetValue);
                DOM.dynamicValue.classList.add("pulse-animation");
            }
        };
        
        window.requestAnimationFrame(step);
    }

    // ---------- PARTICLES ----------
    function createParticles(x, y) {
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement("div");
            particle.style.position = "fixed";
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.style.width = "6px";
            particle.style.height = "6px";
            particle.style.backgroundColor = "var(--success-color)";
            particle.style.borderRadius = "50%";
            particle.style.pointerEvents = "none";
            particle.style.zIndex = "10000";
            
            const angle = (Math.PI * 2 * i) / particleCount;
            const velocity = 2 + Math.random() * 3;
            const tx = Math.cos(angle) * velocity * 20;
            const ty = Math.sin(angle) * velocity * 20;
            
            particle.style.transition = "transform 0.6s cubic-bezier(0, .9, .57, 1), opacity 0.6s ease-out";
            document.body.appendChild(particle);
            
            requestAnimationFrame(() => {
                particle.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
                particle.style.opacity = "0";
            });
            
            setTimeout(() => particle.remove(), 600);
        }
    }

    // ---------- CANVAS ----------
    class CanvasEngine {
        constructor() {
            this.svgNS = "http://www.w3.org/2000/svg";
            this.container = DOM.canvas;
            if(!this.container) return;
            
            this.svg = document.createElementNS(this.svgNS, "svg");
            this.svg.setAttribute("class", "bg-svg-layer");
            this.svg.setAttribute("width", "100%");
            this.svg.setAttribute("height", "100%");
            this.svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
            
            this.defs = document.createElementNS(this.svgNS, "defs");
            this.svg.appendChild(this.defs);
            
            this.createGradients();
            this.createPatterns();
            
            this.bgRect = document.createElementNS(this.svgNS, "rect");
            this.bgRect.setAttribute("width", "100%");
            this.bgRect.setAttribute("height", "100%");
            this.bgRect.setAttribute("fill", "url(#mainGradient)");
            this.svg.appendChild(this.bgRect);
            
            this.gridRect = document.createElementNS(this.svgNS, "rect");
            this.gridRect.setAttribute("width", "100%");
            this.gridRect.setAttribute("height", "100%");
            this.gridRect.setAttribute("fill", "url(#gridPattern)");
            this.gridRect.setAttribute("class", "animated-grid");
            this.svg.appendChild(this.gridRect);
            
            this.circuitRect = document.createElementNS(this.svgNS, "rect");
            this.circuitRect.setAttribute("width", "100%");
            this.circuitRect.setAttribute("height", "100%");
            this.circuitRect.setAttribute("fill", "url(#circuitPattern)");
            this.circuitRect.setAttribute("class", "animated-circuit");
            this.circuitRect.style.opacity = "0.4";
            this.svg.appendChild(this.circuitRect);
            
            this.container.appendChild(this.svg);
            
            this.interactiveNode = document.createElementNS(this.svgNS, "circle");
            this.interactiveNode.setAttribute("r", "150");
            this.interactiveNode.setAttribute("fill", "url(#glowGradient)");
            this.interactiveNode.style.pointerEvents = "none";
            this.interactiveNode.style.mixBlendMode = "screen";
            this.svg.appendChild(this.interactiveNode);
            
            this.bindEvents();
            this.loop();
        }

        createGradients() {
            const mainGrad = document.createElementNS(this.svgNS, "linearGradient");
            mainGrad.setAttribute("id", "mainGradient");
            mainGrad.setAttribute("x1", "0%");
            mainGrad.setAttribute("y1", "0%");
            mainGrad.setAttribute("x2", "100%");
            mainGrad.setAttribute("y2", "100%");
            
            const stop1 = document.createElementNS(this.svgNS, "stop");
            stop1.setAttribute("offset", "0%");
            stop1.setAttribute("class", "stop-color-1");
            
            const stop2 = document.createElementNS(this.svgNS, "stop");
            stop2.setAttribute("offset", "50%");
            stop2.setAttribute("class", "stop-color-2");
            
            const stop3 = document.createElementNS(this.svgNS, "stop");
            stop3.setAttribute("offset", "100%");
            stop3.setAttribute("class", "stop-color-3");
            
            mainGrad.appendChild(stop1);
            mainGrad.appendChild(stop2);
            mainGrad.appendChild(stop3);
            this.defs.appendChild(mainGrad);

            const glowGrad = document.createElementNS(this.svgNS, "radialGradient");
            glowGrad.setAttribute("id", "glowGradient");
            
            const gStop1 = document.createElementNS(this.svgNS, "stop");
            gStop1.setAttribute("offset", "0%");
            gStop1.setAttribute("class", "glow-stop-center");
            
            const gStop2 = document.createElementNS(this.svgNS, "stop");
            gStop2.setAttribute("offset", "100%");
            gStop2.setAttribute("class", "glow-stop-edge");
            
            glowGrad.appendChild(gStop1);
            glowGrad.appendChild(gStop2);
            this.defs.appendChild(glowGrad);
        }

        createPatterns() {
            const gridPat = document.createElementNS(this.svgNS, "pattern");
            gridPat.setAttribute("id", "gridPattern");
            gridPat.setAttribute("width", "100");
            gridPat.setAttribute("height", "173.205");
            gridPat.setAttribute("patternUnits", "userSpaceOnUse");
            
            const path = document.createElementNS(this.svgNS, "path");
            path.setAttribute("d", "M50 0 L100 28.867 L100 86.602 L50 115.47 L0 86.602 L0 28.867 Z M50 115.47 L100 144.337 L100 202.072 L50 230.94 L0 202.072 L0 144.337 Z");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-width", "1");
            path.setAttribute("class", "grid-path");
            path.style.opacity = "0.2";
            
            gridPat.appendChild(path);
            this.defs.appendChild(gridPat);

            const circPat = document.createElementNS(this.svgNS, "pattern");
            circPat.setAttribute("id", "circuitPattern");
            circPat.setAttribute("width", "200");
            circPat.setAttribute("height", "200");
            circPat.setAttribute("patternUnits", "userSpaceOnUse");
            
            const cPath = document.createElementNS(this.svgNS, "path");
            cPath.setAttribute("d", "M 0 50 L 50 50 L 75 25 L 125 25 L 150 50 L 200 50 M 50 100 L 100 100 L 125 125 L 175 125 L 200 100 M 0 150 L 25 150 L 50 175 L 100 175 L 125 150 L 200 150");
            cPath.setAttribute("fill", "none");
            cPath.setAttribute("stroke-width", "1.5");
            cPath.setAttribute("class", "circuit-line");
            cPath.style.opacity = "0.15";
            
            circPat.appendChild(cPath);
            this.defs.appendChild(circPat);
        }

        bindEvents() {
            window.addEventListener("mousemove", (e) => {
                state.mouse.targetX = e.clientX;
                state.mouse.targetY = e.clientY;
            });
            window.addEventListener("resize", () => {
                state.canvas.width = window.innerWidth;
                state.canvas.height = window.innerHeight;
            });
        }

        loop() {
            state.mouse.x += (state.mouse.targetX - state.mouse.x) * config.springFactor;
            state.mouse.y += (state.mouse.targetY - state.mouse.y) * config.springFactor;
            
            this.interactiveNode.setAttribute("cx", state.mouse.x);
            this.interactiveNode.setAttribute("cy", state.mouse.y);
            
            requestAnimationFrame(() => this.loop());
        }
    }

    // ---------- PARTICLE NETWORK ----------
    class ParticleNetwork {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.particles = [];
            this.mouse = { x: null, y: null, radius: 150 };
            this.nodeColor = '#2563eb';
            this.lineColor = '#0ea5e9';
            
            this.resize();
            this.createParticles();
            this.bindEvents();
            this.animate();
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        createParticles() {
            const area = this.canvas.width * this.canvas.height;
            const count = Math.floor(area / config.particleCountFactor);
            this.particles = [];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    size: Math.random() * 1.5 + 1.5,
                    speedX: (Math.random() - 0.5) * 0.8,
                    speedY: (Math.random() - 0.5) * 0.8
                });
            }
        }

        bindEvents() {
            window.addEventListener('resize', () => {
                this.resize();
                this.createParticles();
            });

            window.addEventListener('mousemove', (e) => {
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            });

            window.addEventListener('mouseout', () => {
                this.mouse.x = null;
                this.mouse.y = null;
            });

            window.addEventListener('touchmove', (e) => {
                this.mouse.x = e.touches[0].clientX;
                this.mouse.y = e.touches[0].clientY;
            });

            window.addEventListener('touchend', () => {
                this.mouse.x = null;
                this.mouse.y = null;
            });
        }

        updateColors(nodeColor, lineColor) {
            this.nodeColor = nodeColor;
            this.lineColor = lineColor;
        }

        updateParticles() {
            for (let p of this.particles) {
                p.x += p.speedX;
                p.y += p.speedY;

                if (p.x < 0 || p.x > this.canvas.width) p.speedX *= -1;
                if (p.y < 0 || p.y > this.canvas.height) p.speedY *= -1;

                if (this.mouse.x != null && this.mouse.y != null) {
                    const dx = p.x - this.mouse.x;
                    const dy = p.y - this.mouse.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < this.mouse.radius) {
                        const force = (this.mouse.radius - distance) / this.mouse.radius;
                        p.x += (dx / distance) * force * 2;
                        p.y += (dy / distance) * force * 2;
                    }
                }
            }
        }

        drawParticles() {
            for (let p of this.particles) {
                this.ctx.fillStyle = this.nodeColor + 'b3';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }

        connectParticles() {
            const maxDistance = 120;
            for (let a = 0; a < this.particles.length; a++) {
                for (let b = a + 1; b < this.particles.length; b++) {
                    const dx = this.particles[a].x - this.particles[b].x;
                    const dy = this.particles[a].y - this.particles[b].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < maxDistance) {
                        const opacity = 1 - distance / maxDistance;
                        this.ctx.strokeStyle = this.lineColor + Math.floor(opacity * 64).toString(16).padStart(2, '0');
                        this.ctx.lineWidth = 1;
                        this.ctx.beginPath();
                        this.ctx.moveTo(this.particles[a].x, this.particles[a].y);
                        this.ctx.lineTo(this.particles[b].x, this.particles[b].y);
                        this.ctx.stroke();
                    }
                }
            }
        }

        animate() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.updateParticles();
            this.connectParticles();
            this.drawParticles();
            requestAnimationFrame(() => this.animate());
        }
    }

    function securityCheck() {
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                toast.show("Kaynak kod korumalıdır.", "error");
            }
            if (e.key === 'F12') {
                e.preventDefault();
                toast.show("Geliştirici araçları devre dışı.", "error");
            }
        });
    }

    // ---------- START ----------
    function init() {
        initTheme();
        initScrollEngine();
        initTiltPhysics();
        initObserver();
        initCopyLogic();
        securityCheck();
        
        if (!state.isMobile) {
            new CanvasEngine();
        }

        if (DOM.particleCanvas) {
            window.particleNetwork = new ParticleNetwork(DOM.particleCanvas);
            const initialColors = getParticleColors();
            window.particleNetwork.updateColors(initialColors.node, initialColors.line);
        }

        console.log("%cSYSTEM ONLINE", "color: #10b981; font-size: 20px; font-weight: bold; text-shadow: 0 0 10px #10b981;");
        console.log("%cALL CIRCUITS FUNCTIONAL", "color: #3b82f6; font-size: 14px;");
        console.log("%cPARTICLE NETWORK ENGAGED", "color: #8b5cf6; font-size: 12px;");
    }

    init();
});