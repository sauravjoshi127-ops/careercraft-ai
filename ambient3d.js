/* ambient3d.js - High-Performance Canvas 3D Particle Network */

class ParticleNetwork {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.particles = [];
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.config = {
            particleCount: 150,
            maxDistance: 150,
            baseRadius: 1.5,
            rotationSpeed: 0.0005,
            mouseInfluence: 0.05
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

        // Initialize 3D particles
        for (let i = 0; i < this.config.particleCount; i++) {
            this.particles.push({
                x: (Math.random() - 0.5) * this.width * 2,
                y: (Math.random() - 0.5) * this.height * 2,
                z: Math.random() * 1000 - 500,
                baseZ: Math.random() * 1000 - 500
            });
        }

        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    animate() {
        // Smooth mouse interpolation
        this.targetX += (this.mouseX - this.targetX) * this.config.mouseInfluence;
        this.targetY += (this.mouseY - this.targetY) * this.config.mouseInfluence;

        // Clear background (Deep Obsidian)
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const fov = 400;
        const projectedNodes = [];

        // Rotate and project particles
        this.particles.forEach(p => {
            // Apply slow continuous rotation
            const angle = Date.now() * this.config.rotationSpeed + p.baseZ;
            const rx = p.x * Math.cos(angle) - p.z * Math.sin(angle);
            const rz = p.x * Math.sin(angle) + p.z * Math.cos(angle);

            // Apply mouse parallax
            const px = rx - this.targetX * (rz * 0.002);
            const py = p.y - this.targetY * (rz * 0.002);

            // 3D Projection
            const scale = fov / (fov + rz + 500);
            const x2d = (px * scale) + this.width / 2;
            const y2d = (py * scale) + this.height / 2;

            if (scale > 0) {
                projectedNodes.push({ x: x2d, y: y2d, scale: scale, z: rz });
            }
        });

        // Draw connections
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < projectedNodes.length; i++) {
            const p1 = projectedNodes[i];
            
            // Draw Node
            this.ctx.beginPath();
            this.ctx.arc(p1.x, p1.y, this.config.baseRadius * p1.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, p1.scale * 0.6)})`;
            this.ctx.fill();

            // Connect nearby nodes
            for (let j = i + 1; j < projectedNodes.length; j++) {
                const p2 = projectedNodes[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < this.config.maxDistance * this.config.maxDistance) {
                    const opacity = 1 - Math.sqrt(distSq) / this.config.maxDistance;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    // Icy silver connection lines
                    this.ctx.strokeStyle = `rgba(161, 161, 166, ${opacity * 0.2 * p1.scale})`;
                    this.ctx.stroke();
                }
            }
        }

        requestAnimationFrame(() => this.animate());
    }
}

function initAmbient() {
    // Inject Canvas if not present
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
