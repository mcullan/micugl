"use strict";const E=require("react/jsx-runtime"),f=require("./useUniformUpdaters-DGX0mf9g.js"),F=require("./BasePingPongShaderComponent-BvRm7-g5.js"),i=require("react"),c=`
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`,g=`
  precision highp float;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec2 u_mouse;
  uniform float u_mouseForce;
  uniform float u_damping;
  
  varying vec2 v_texCoord;
  
  void main() {
    vec2 uv = v_texCoord;
    vec2 texelSize = 1.0 / u_resolution;
    
    vec4 state = texture2D(u_texture0, uv);
    float height = state.r;
    float velocity = state.g;
    
    float north = texture2D(u_texture0, uv + vec2(0.0, texelSize.y)).r;
    float south = texture2D(u_texture0, uv - vec2(0.0, texelSize.y)).r;
    float east = texture2D(u_texture0, uv + vec2(texelSize.x, 0.0)).r;
    float west = texture2D(u_texture0, uv - vec2(texelSize.x, 0.0)).r;
    
    float newVelocity = velocity + ((north + south + east + west) / 4.0 - height) * 2.0;
    newVelocity *= u_damping;
    
    float newHeight = height + newVelocity;
    
    vec2 mouseVec = u_mouse - uv;
    float mouseDistance = length(mouseVec);
    if (mouseDistance < 0.05 && u_mouseForce > 0.0) {
        newHeight += 0.5;
    }
    
    float startTime = mod(u_time * 0.001, 10.0);
    if (startTime < 0.2) {
        vec2 center = vec2(0.5, 0.5);
        float centerDist = length(uv - center);
        if (centerDist < 0.05) {
            newHeight += 0.5 * (1.0 - startTime * 5.0);
        }
    }
    
    gl_FragColor = vec4(newHeight, newVelocity, 0.0, 1.0);
  }
`,p=`
  precision highp float;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform sampler2D u_texture0;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  
  varying vec2 v_texCoord;
  
  void main() {
    vec2 uv = v_texCoord;
    
    vec4 state = texture2D(u_texture0, uv);
    float height = state.r;
    
    vec3 color = mix(u_color1, u_color2, (height + 1.0) * 0.5);
    
    float t = u_time * 0.001;
    float brightness = 1.0 + 0.1 * sin(uv.x * 10.0 + t) * sin(uv.y * 10.0 + t);
    color *= brightness;
    
    gl_FragColor = vec4(color, 1.0);
  }
`,V=[.1,.3,.1],P=[.3,.2,.4],b=({damping:_=.99,mouseForce:x=.5,color1:S=V,color2:y=P,iterations:C=2,className:w="",style:D})=>{const u=i.useRef([.5,.5]),o=i.useRef(!1),L=f.createShaderConfig({vertexShader:c,fragmentShader:g,uniformNames:{u_texture0:"sampler2D",u_mouse:"vec2",u_mouseForce:"float",u_damping:"float"}}),R=f.createShaderConfig({vertexShader:c,fragmentShader:p,uniformNames:{u_texture0:"sampler2D",u_color1:"vec3",u_color2:"vec3"}});return i.useEffect(()=>{const s=e=>{const t=e.target.getBoundingClientRect(),n=(e.clientX-t.left)/t.width,r=1-(e.clientY-t.top)/t.height;u.current=[n,r]},a=()=>{o.current=!0},l=()=>{o.current=!1},v=e=>{if(e.touches.length>0){e.preventDefault();const t=e.target.getBoundingClientRect(),n=(e.touches[0].clientX-t.left)/t.width,r=1-(e.touches[0].clientY-t.top)/t.height;u.current=[n,r],o.current=!0}},m=e=>{if(e.touches.length>0&&o.current){e.preventDefault();const t=e.target.getBoundingClientRect(),n=(e.touches[0].clientX-t.left)/t.width,r=1-(e.touches[0].clientY-t.top)/t.height;u.current=[n,r]}},d=()=>{o.current=!1};return document.addEventListener("mousemove",s),document.addEventListener("mousedown",a),document.addEventListener("mouseup",l),document.addEventListener("touchstart",v,{passive:!1}),document.addEventListener("touchmove",m,{passive:!1}),document.addEventListener("touchend",d),()=>{document.removeEventListener("mousemove",s),document.removeEventListener("mousedown",a),document.removeEventListener("mouseup",l),document.removeEventListener("touchstart",v),document.removeEventListener("touchmove",m),document.removeEventListener("touchend",d)}},[]),E.jsx(F.BasePingPongShaderComponent,{programId:"ripple-simulation",shaderConfig:L,secondaryProgramId:"ripple-render",secondaryShaderConfig:R,iterations:C,className:w,style:D,framebufferOptions:{width:0,height:0,textureCount:2,textureOptions:{minFilter:WebGLRenderingContext.LINEAR,magFilter:WebGLRenderingContext.LINEAR}},uniforms:{u_mouse:{type:"vec2",value:()=>new Float32Array(u.current)},u_mouseForce:{type:"float",value:()=>o.current?x:0},u_damping:{type:"float",value:_}},secondaryUniforms:{u_color1:{type:"vec3",value:new Float32Array(S)},u_color2:{type:"vec3",value:new Float32Array(y)}}})};exports.SimpleRipple=b;exports.rippleRenderShader=p;exports.rippleSimulationShader=g;exports.rippleVertexShader=c;
