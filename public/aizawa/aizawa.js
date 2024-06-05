/* p5.js (https://p5js.org/)
 * Under Creative Commons License
 * https://creativecommons.org/licenses/by-sa/4.0/
 * Written by Juan Carlos Ponce Campuzano, 19-Jul-2018
 * Last update: 5-Jun-2024
 * https://www.dynamicmath.xyz/strange-attractors/
 */

let easycam; //3D view

let particles = [];

let points = [];
let NUM_POINTS = 3900; //num of points in curve

let numMax = 600; //num of particles moving around
let t = 0;
let h = 0.01;
let currentParticle = 0;

// settings and presets
let parDef = {
    Attractor: "Aizawa",
    Speed: 1.5,
    Particles: true,
    Preset: function () {
        removeElements(); // Check https://p5js.org/reference/#/p5/removeElements
        this.Particles = true;
        this.Speed = 2.0;
        attractor.a = 0.95;
        attractor.b = 0.7;
        attractor.c = 0.6;
        attractor.d = 3.5;
        attractor.e = 0.25;
        attractor.f = 0.1;
        attractor.x = 0.1;
        attractor.y = 1;
        attractor.z = 0.01;
        for (let i = points.length - 1; i >= 0; i -= 1) {
            points.splice(i, 1);
        }
        initSketch();
    },
    Randomize: randomCurve,
};

let attractor;

function initSketch() {
    let p = {
        x: attractor.x,
        y: attractor.y,
        z: attractor.z,
    };

    for (var j = 0; j < NUM_POINTS; j++) {
        p = attractor.generatePoint(p.x, p.y, p.z);

        if (isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) {
            console.log("Failed, retry");
            randomCurve();
            return;
        }

        points.push(new p5.Vector(attractor.scale * p.x, attractor.scale * p.y, attractor.scale * p.z));
    }
    let m = 2;
    for (var i = 0; i < numMax; i++) {
        particles[i] = new Particle(random(-m, m), random(-m, m), random(0, m), t, h);
    }
}

function setup() {
    attractor = new AizawaAttractor();
    // create gui (dat.gui)
    /*
    let gui = new dat.GUI();
    gui.add(parDef, 'Attractor');
    gui.add(parDef, 'Speed', 0, 5, 0.01).listen();
    gui.add(parDef, 'Particles' );
    gui.add(parDef, 'Randomize'  );
    gui.add(parDef, 'Preset'  );
    */

    pixelDensity(2); // This is to display correctly for Retina displays

    createCanvas(windowWidth, windowHeight, WEBGL);
    setAttributes("antialias", true);

    //console.log(Dw.EasyCam.INFO);

    easycam = new Dw.EasyCam(this._renderer, { distance: 4.5 });

    // place initial samples
    initSketch();
}

function draw() {
    // projection
    perspective((60 * PI) / 180, width / height, 1, 5000);

    // BG
    background(0);

    // Set initial view
    rotateX(0.8);
    rotateY(-0.2);
    rotateZ(0.9);

    let hu = 0;
    push();
    noFill();
    beginShape();
    for (let v of points) {
        stroke(hu, 193, 255);
        strokeWeight(0.01);
        vertex(v.x, v.y, v.z);

        hu += 1;
        if (hu > 255) {
            hu = 0;
        }
    }
    endShape();
    pop();

    ambientLight(255, 0, 255); // Needed to see colors

    if (parDef.Particles == true) {
        //updating and displaying the particles
        for (let i = particles.length - 1; i >= 0; i -= 1) {
            let p = particles[i];
            p.update();
            p.display();
            if (p.x > 8 || p.y > 8 || p.z > 8 || p.x < -8 || p.y < -8 || p.z < -8) {
                particles.splice(i, 1);
                currentParticle--;
                particles.push(new Particle(random(-5, 5), random(-5, 5), random(0, 5), t, h));
            }
        }
    }

    // gizmo for reference
    //strokeWeight(0.1);
    //stroke(255, 32,  0); line(0,0,0,2,0,0);
    //stroke( 32,255, 32); line(0,0,0,0,2,0);
    //stroke(  0, 32,255); line(0,0,0,0,0,2);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    easycam.setViewport([0, 0, windowWidth, windowHeight]);
}

function randomCurve() {
    removeElements();
    for (var i = points.length - 1; i >= 0; i -= 1) {
        points.splice(i, 1);
    }
    attractor.randomize();
    initSketch();
}

const componentFX = (t, x, y, z) => parDef.Speed * ((z - attractor.b) * x - attractor.d * y); //Change this function

const componentFY = (t, x, y, z) => parDef.Speed * (attractor.d * x + (z - attractor.b) * y); //Change this function

const componentFZ = (t, x, y, z) =>
    parDef.Speed *
    (attractor.c +
        attractor.a * z -
        (z * z * z) / 3 -
        (x * x + y * y) * (1 + attractor.e * z) +
        attractor.f * z * x * x * x); //Change this function

// Runge-Kutta method
function rungeKutta(time, x, y, z, h) {
    let k1 = componentFX(time, x, y, z);
    let j1 = componentFY(time, x, y, z);
    let i1 = componentFZ(time, x, y, z);

    let k2 = componentFX(time + (1 / 2) * h, x + (1 / 2) * h * k1, y + (1 / 2) * h * j1, z + (1 / 2) * h * i1);
    let j2 = componentFY(time + (1 / 2) * h, x + (1 / 2) * h * k1, y + (1 / 2) * h * j1, z + (1 / 2) * h * i1);
    let i2 = componentFZ(time + (1 / 2) * h, x + (1 / 2) * h * k1, y + (1 / 2) * h * j1, z + (1 / 2) * h * i1);
    let k3 = componentFX(time + (1 / 2) * h, x + (1 / 2) * h * k2, y + (1 / 2) * h * j2, z + (1 / 2) * h * i2);
    let j3 = componentFY(time + (1 / 2) * h, x + (1 / 2) * h * k2, y + (1 / 2) * h * j2, z + (1 / 2) * h * i2);
    let i3 = componentFZ(time + (1 / 2) * h, x + (1 / 2) * h * k2, y + (1 / 2) * h * j2, z + (1 / 2) * h * i2);
    let k4 = componentFX(time + h, x + h * k3, y + h * j3, z + h * i3);
    let j4 = componentFY(time + h, x + h * k3, y + h * j3, z + h * i3);
    let i4 = componentFZ(time + h, x + h * k3, y + h * j3, z + h * i3);
    x = x + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    y = y + (h / 6) * (j1 + 2 * j2 + 2 * j3 + j4);
    z = z + (h / 6) * (i1 + 2 * i2 + 2 * i3 + i4);
    return {
        u: x,
        v: y,
        w: z,
    };
}

//Particle definition and motion
class Particle {
    constructor(_x, _y, _z, _t, _h) {
        this.x = _x;
        this.y = _y;
        this.z = _z;
        this.time = _t;
        this.radius = random(0.018, 0.018);
        this.h = _h;
        this.op = random(200, 200);
        this.r = random(255, 255);
        this.g = random(255);
        this.b = random(255);
    }

    update() {
        let tmp = rungeKutta(this.time, this.x, this.y, this.z, this.h);

        this.x = tmp.u;
        this.y = tmp.v;
        this.z = tmp.w;

        this.time += this.h;
    }

    display() {
        push();
        translate(this.x, this.y, this.z);
        ambientMaterial(this.r, this.b, this.g);
        noStroke();
        sphere(this.radius, 7, 7);
        pop();
    }
}

//Curve class
class AizawaAttractor {
    constructor() {
        this.speed = 0.5;

        this.a = 0.95;
        this.b = 0.7;
        this.c = 0.6;
        this.d = 3.5;
        this.e = 0.25;
        this.f = 0.1;

        this.x = 0.1;
        this.y = 1;
        this.z = 0.01;

        this.h = 0.03;
        this.scale = 1;
    }

    generatePoint(x, y, z) {
        var nx = this.speed * ((z - this.b) * x - this.d * y);
        var ny = this.speed * (this.d * x + (z - this.b) * y);
        var nz =
            this.speed *
            (this.c + this.a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + this.e * z) + this.f * z * x * x * x);

        x += this.h * nx;
        y += this.h * ny;
        z += this.h * nz;

        return { x: x, y: y, z: z };
    }

    randomize() {
        this.a = random(0.3, 3);
        this.b = random(0.3, 3);
        this.c = random(0.1, 3);
        this.d = random(1, 3);
        this.e = random(0.01, 3);
        this.f = random(0.01, 3);

        this.x = random(-1.1, 1.1);
        this.y = random(-1.1, 1.1);
        this.z = random(-1, 1);
    }
}
