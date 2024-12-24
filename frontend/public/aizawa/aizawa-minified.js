let easycam;
const particles = [],
  points = [],
  NUM_POINTS = 3900,
  numMax = 600,
  t = 0,
  h = 0.01;
let currentParticle = 0;
const parDef = {
  Attractor: 'Aizawa',
  Speed: 1.5,
  Particles: !0,
  Preset: function () {
    removeElements(),
      (this.Particles = !0),
      (this.Speed = 2),
      (attractor.a = 0.95),
      (attractor.b = 0.7),
      (attractor.c = 0.6),
      (attractor.d = 3.5),
      (attractor.e = 0.25),
      (attractor.f = 0.1),
      (attractor.x = 0.1),
      (attractor.y = 1),
      (attractor.z = 0.01);
    for (let a = points.length - 1; a >= 0; a -= 1) points.splice(a, 1);
    initSketch();
  },
  Randomize: randomCurve,
};
let attractor;
function initSketch() {
  let a = { x: attractor.x, y: attractor.y, z: attractor.z };
  for (var e = 0; e < 3900; e++) {
    if (isNaN((a = attractor.generatePoint(a.x, a.y, a.z)).x) || isNaN(a.y) || isNaN(a.z)) {
      console.log('Failed, retry'), randomCurve();
      return;
    }
    points.push(new p5.Vector(attractor.scale * a.x, attractor.scale * a.y, attractor.scale * a.z));
  }
  for (var i = 0; i < 600; i++) particles[i] = new Particle(random(-2, 2), random(-2, 2), random(0, 2), 0, 0.01);
}
function setup() {
  (attractor = new AizawaAttractor()),
    pixelDensity(2),
    createCanvas(windowWidth, windowHeight, WEBGL),
    setAttributes('antialias', !0),
    (easycam = new Dw.EasyCam(this._renderer, { distance: 4.5 })),
    initSketch();
}
function draw() {
  perspective((60 * PI) / 180, width / height, 1, 5e3), background(0), rotateX(0.8), rotateY(-0.2), rotateZ(0.9);
  let a = 0;
  for (const e of (push(), noFill(), beginShape(), points))
    stroke(a, 193, 255), strokeWeight(0.01), vertex(e.x, e.y, e.z), (a += 1) > 255 && (a = 0);
  if ((endShape(), pop(), ambientLight(255, 0, 255), !0 == parDef.Particles))
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const r = particles[i];
      r.update(),
        r.display(),
        (r.x > 8 || r.y > 8 || r.z > 8 || r.x < -8 || r.y < -8 || r.z < -8) &&
          (particles.splice(i, 1),
          currentParticle--,
          particles.push(new Particle(random(-5, 5), random(-5, 5), random(0, 5), 0, 0.01)));
    }
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight), easycam.setViewport([0, 0, windowWidth, windowHeight]);
}
function randomCurve() {
  removeElements();
  for (var a = points.length - 1; a >= 0; a -= 1) points.splice(a, 1);
  attractor.randomize(), initSketch();
}
const componentFX = (a, e, i, r) => parDef.Speed * ((r - attractor.b) * e - attractor.d * i),
  componentFY = (a, e, i, r) => parDef.Speed * (attractor.d * e + (r - attractor.b) * i),
  componentFZ = (a, e, i, r) =>
    parDef.Speed *
    (attractor.c +
      attractor.a * r -
      (r * r * r) / 3 -
      (e * e + i * i) * (1 + attractor.e * r) +
      attractor.f * r * e * e * e);
function rungeKutta(a, e, i, r, s) {
  const $ = componentFX(a, e, i, r),
    o = componentFY(a, e, i, r),
    c = componentFZ(a, e, i, r),
    n = componentFX(a + 0.5 * s, e + 0.5 * s * $, i + 0.5 * s * o, r + 0.5 * s * c),
    p = componentFY(a + 0.5 * s, e + 0.5 * s * $, i + 0.5 * s * o, r + 0.5 * s * c),
    _ = componentFZ(a + 0.5 * s, e + 0.5 * s * $, i + 0.5 * s * o, r + 0.5 * s * c),
    l = componentFX(a + 0.5 * s, e + 0.5 * s * n, i + 0.5 * s * p, r + 0.5 * s * _),
    d = componentFY(a + 0.5 * s, e + 0.5 * s * n, i + 0.5 * s * p, r + 0.5 * s * _),
    u = componentFZ(a + 0.5 * s, e + 0.5 * s * n, i + 0.5 * s * p, r + 0.5 * s * _),
    m = componentFX(a + s, e + s * l, i + s * d, r + s * u),
    f = componentFY(a + s, e + s * l, i + s * d, r + s * u),
    y = componentFZ(a + s, e + s * l, i + s * d, r + s * u);
  return (
    (e += (s / 6) * ($ + 2 * n + 2 * l + m)),
    { u: e, v: (i += (s / 6) * (o + 2 * p + 2 * d + f)), w: (r += (s / 6) * (c + 2 * _ + 2 * u + y)) }
  );
}
class Particle {
  constructor(a, e, i, r, s) {
    (this.x = a),
      (this.y = e),
      (this.z = i),
      (this.time = r),
      (this.radius = random(0.018, 0.018)),
      (this.h = s),
      (this.op = random(200, 200)),
      (this.r = random(255, 255)),
      (this.g = random(255)),
      (this.b = random(255));
  }
  update() {
    const a = rungeKutta(this.time, this.x, this.y, this.z, this.h);
    (this.x = a.u), (this.y = a.v), (this.z = a.w), (this.time += this.h);
  }
  display() {
    push(),
      translate(this.x, this.y, this.z),
      ambientMaterial(this.r, this.b, this.g),
      noStroke(),
      sphere(this.radius, 7, 7),
      pop();
  }
}
class AizawaAttractor {
  constructor() {
    (this.speed = 0.5),
      (this.a = 0.95),
      (this.b = 0.7),
      (this.c = 0.6),
      (this.d = 3.5),
      (this.e = 0.25),
      (this.f = 0.1),
      (this.x = 0.1),
      (this.y = 1),
      (this.z = 0.01),
      (this.h = 0.03),
      (this.scale = 1);
  }
  generatePoint(a, e, i) {
    var r = this.speed * ((i - this.b) * a - this.d * e),
      s = this.speed * (this.d * a + (i - this.b) * e),
      $ =
        this.speed *
        (this.c + this.a * i - (i * i * i) / 3 - (a * a + e * e) * (1 + this.e * i) + this.f * i * a * a * a);
    return (a += this.h * r), { x: a, y: (e += this.h * s), z: (i += this.h * $) };
  }
  randomize() {
    (this.a = random(0.3, 3)),
      (this.b = random(0.3, 3)),
      (this.c = random(0.1, 3)),
      (this.d = random(1, 3)),
      (this.e = random(0.01, 3)),
      (this.f = random(0.01, 3)),
      (this.x = random(-1.1, 1.1)),
      (this.y = random(-1.1, 1.1)),
      (this.z = random(-1, 1));
  }
}
