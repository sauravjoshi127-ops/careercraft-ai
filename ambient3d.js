/* ambient3d.js - Cinematic 3D Neural Grid Visuals */

class ParticleNetwork {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.particles = [];
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.config = {
            particleCount: 120,
            maxDistance: 180,
            baseRadius: 1.2,
            rotationSpeed: 0.0003,
            mouseInfluence: 0.04,
            accentColor: '#00d2ff',
            nodeColor: '#ffffff'
        };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        document.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX - this.width / 2);
            this.mouseY = (e.clientY - this.height / 2);
        });

        // Initialize 3D particles in a spherical/cloud distribution
        for (let i = 0; i < this.config.particleCount; i++) {
            this.particles.push({
                x: (Math.random() - 0.5) * this.width * 2.5,
                y: (Math.random() - 0.5) * this.height * 2.5,
                z: Math.random() * 1200 - 600,
                baseZ: Math.random() * 1000 - 500,
                pulse: Math.random() * Math.PI * 2
            });
        }

        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * window.devicePixelRatio;
        this.canvas.height = this.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    animate() {
        // Smooth mouse interpolation
        this.targetX += (this.mouseX - this.targetX) * this.config.mouseInfluence;
        this.targetY += (this.mouseY - this.targetY) * this.config.mouseInfluence;

        // Clear with slight trail for motion blur (Deep Obsidian)
        this.ctx.fillStyle = '#030303';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const fov = 500;
        const projectedNodes = [];
        const time = Date.now();

        // Rotate and project particles
        this.particles.forEach(p => {
            const angle = time * this.config.rotationSpeed + p.baseZ;
            const rx = p.x * Math.cos(angle) - p.z * Math.sin(angle);
            const rz = p.x * Math.sin(angle) + p.z * Math.cos(angle);

            // Parallax shift
            const px = rx - this.targetX * (rz * 0.0015);
            const py = p.y - this.targetY * (rz * 0.0015);

            const scale = fov / (fov + rz + 600);
            const x2d = (px * scale) + this.width / 2;
            const y2d = (py * scale) + this.height / 2;

            if (scale > 0.1) {
                p.pulse += 0.05;
                const pulseScale = 1 + Math.sin(p.pulse) * 0.2;
                projectedNodes.push({ x: x2d, y: y2d, scale: scale * pulseScale, z: rz });
            }
        });

        // Sort by Z for proper depth
        projectedNodes.sort((a, b) => b.z - a.z);

        // Draw connections first
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < projectedNodes.length; i++) {
            const p1 = projectedNodes[i];
            
            for (let j = i + 1; j < projectedNodes.length; j++) {
                const p2 = projectedNodes[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < this.config.maxDistance * this.config.maxDistance) {
                    const opacity = (1 - Math.sqrt(distSq) / this.config.maxDistance) * p1.scale * p2.scale;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    // Electric Cyan connections
                    this.ctx.strokeStyle = `rgba(0, 210, 255, ${opacity * 0.25})`;
                    this.ctx.stroke();
                }
            }
        }

        // Draw nodes with glow
        projectedNodes.forEach(p => {
            const opacity = Math.min(1, p.scale * 0.8);
            
            // Outer glow
            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10 * p.scale);
            gradient.addColorStop(0, `rgba(0, 210, 255, ${opacity * 0.4})`);
            gradient.addColorStop(1, 'rgba(0, 210, 255, 0)');
            this.ctx.fillStyle = gradient;
            this.ctx.arc(p.x, p.y, 10 * p.scale, 0, Math.PI * 2);
            this.ctx.fill();

            // Core node
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, this.config.baseRadius * p.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            this.ctx.fill();
        });

        requestAnimationFrame(() => this.animate());
    }
}

function initAmbient() {
    if (!document.getElementById('ambient-canvas')) {
        const canvas = document.createElement('canvas');
        canvas.id = 'ambient-canvas';
        document.body.prepend(canvas);
    }
    new ParticleNetwork('ambient-canvas');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAmbient);
} else {
    initAmbient();
}
