let easycam;const particles=[],points=[],NUM_POINTS=3900,numMax=600,t=0,h=.01;let currentParticle=0;const parDef={Attractor:"Aizawa",Speed:1.5,Particles:!0,Preset:function(){removeElements(),this.Particles=!0,this.Speed=2,attractor.a=.95,attractor.b=.7,attractor.c=.6,attractor.d=3.5,attractor.e=.25,attractor.f=.1,attractor.x=.1,attractor.y=1,attractor.z=.01;for(let a=points.length-1;a>=0;a-=1)points.splice(a,1);initSketch()},Randomize:randomCurve};let attractor;function initSketch(){let a={x:attractor.x,y:attractor.y,z:attractor.z};for(var e=0;e<3900;e++){if(isNaN((a=attractor.generatePoint(a.x,a.y,a.z)).x)||isNaN(a.y)||isNaN(a.z)){console.log("Failed, retry"),randomCurve();return}points.push(new p5.Vector(attractor.scale*a.x,attractor.scale*a.y,attractor.scale*a.z))}for(var i=0;i<600;i++)particles[i]=new Particle(random(-2,2),random(-2,2),random(0,2),0,.01)}function setup(){attractor=new AizawaAttractor,pixelDensity(2),createCanvas(windowWidth,windowHeight,WEBGL),setAttributes("antialias",!0),easycam=new Dw.EasyCam(this._renderer,{distance:4.5}),initSketch()}function draw(){perspective(60*PI/180,width/height,1,5e3),background(0),rotateX(.8),rotateY(-.2),rotateZ(.9);let a=0;for(let e of(push(),noFill(),beginShape(),points))stroke(a,193,255),strokeWeight(.01),vertex(e.x,e.y,e.z),(a+=1)>255&&(a=0);if(endShape(),pop(),ambientLight(255,0,255),!0==parDef.Particles)for(let i=particles.length-1;i>=0;i-=1){let r=particles[i];r.update(),r.display(),(r.x>8||r.y>8||r.z>8||r.x<-8||r.y<-8||r.z<-8)&&(particles.splice(i,1),currentParticle--,particles.push(new Particle(random(-5,5),random(-5,5),random(0,5),0,.01)))}}function windowResized(){resizeCanvas(windowWidth,windowHeight),easycam.setViewport([0,0,windowWidth,windowHeight])}function randomCurve(){removeElements();for(var a=points.length-1;a>=0;a-=1)points.splice(a,1);attractor.randomize(),initSketch()}const componentFX=(a,e,i,r)=>parDef.Speed*((r-attractor.b)*e-attractor.d*i),componentFY=(a,e,i,r)=>parDef.Speed*(attractor.d*e+(r-attractor.b)*i),componentFZ=(a,e,i,r)=>parDef.Speed*(attractor.c+attractor.a*r-r*r*r/3-(e*e+i*i)*(1+attractor.e*r)+attractor.f*r*e*e*e);function rungeKutta(a,e,i,r,s){let $=componentFX(a,e,i,r),o=componentFY(a,e,i,r),c=componentFZ(a,e,i,r),n=componentFX(a+.5*s,e+.5*s*$,i+.5*s*o,r+.5*s*c),p=componentFY(a+.5*s,e+.5*s*$,i+.5*s*o,r+.5*s*c),_=componentFZ(a+.5*s,e+.5*s*$,i+.5*s*o,r+.5*s*c),l=componentFX(a+.5*s,e+.5*s*n,i+.5*s*p,r+.5*s*_),d=componentFY(a+.5*s,e+.5*s*n,i+.5*s*p,r+.5*s*_),u=componentFZ(a+.5*s,e+.5*s*n,i+.5*s*p,r+.5*s*_),m=componentFX(a+s,e+s*l,i+s*d,r+s*u),f=componentFY(a+s,e+s*l,i+s*d,r+s*u),y=componentFZ(a+s,e+s*l,i+s*d,r+s*u);return e+=s/6*($+2*n+2*l+m),{u:e,v:i+=s/6*(o+2*p+2*d+f),w:r+=s/6*(c+2*_+2*u+y)}}class Particle{constructor(a,e,i,r,s){this.x=a,this.y=e,this.z=i,this.time=r,this.radius=random(.018,.018),this.h=s,this.op=random(200,200),this.r=random(255,255),this.g=random(255),this.b=random(255)}update(){let a=rungeKutta(this.time,this.x,this.y,this.z,this.h);this.x=a.u,this.y=a.v,this.z=a.w,this.time+=this.h}display(){push(),translate(this.x,this.y,this.z),ambientMaterial(this.r,this.b,this.g),noStroke(),sphere(this.radius,7,7),pop()}}class AizawaAttractor{constructor(){this.speed=.5,this.a=.95,this.b=.7,this.c=.6,this.d=3.5,this.e=.25,this.f=.1,this.x=.1,this.y=1,this.z=.01,this.h=.03,this.scale=1}generatePoint(a,e,i){var r=this.speed*((i-this.b)*a-this.d*e),s=this.speed*(this.d*a+(i-this.b)*e),$=this.speed*(this.c+this.a*i-i*i*i/3-(a*a+e*e)*(1+this.e*i)+this.f*i*a*a*a);return a+=this.h*r,{x:a,y:e+=this.h*s,z:i+=this.h*$}}randomize(){this.a=random(.3,3),this.b=random(.3,3),this.c=random(.1,3),this.d=random(1,3),this.e=random(.01,3),this.f=random(.01,3),this.x=random(-1.1,1.1),this.y=random(-1.1,1.1),this.z=random(-1,1)}}