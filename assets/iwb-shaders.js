/*
 * Interactive Wallpaper Shaders
 *
 * Nine WebGL2 fragment-shader "wallpapers" that respond to cursor position
 * and clicks. Exported on window.OmniflexInteractiveWallpapers so the
 * `interactive-wallpaper-banner` section can pick one by name at render time.
 */
(function () {
  const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0, 1); }`;

  const COMMON = `#version 300 es
precision highp float;
uniform vec2 R;
uniform float T;
uniform vec2 M;
uniform vec2 C;
uniform float CT;
out vec4 O;

#define PI 3.14159265359
#define TAU 6.28318530718

float h21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 h22(vec2 p){
  vec3 a = fract(vec3(p.xyx) * vec3(.1031, .103, .0973));
  a += dot(a, a.yzx + 33.33);
  return fract((a.xx + a.yz) * a.zy);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(
    mix(h21(i), h21(i + vec2(1, 0)), f.x),
    mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.877, .479, -.479, .877);
  for(int i = 0; i < 6; i++){ v += a * vnoise(p); p = r * p * 2.; a *= .5; }
  return v;
}
float grain(vec2 p, float t){ return (h21(p + fract(t)) - .5) * .018; }
`;

  const NEBULA = `
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .12;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  float md = length(p - mp);

  vec2 warp = (p - mp) / (md * md + .3) * .2;
  vec2 q = p + warp;

  float n1 = fbm(q * 2. + vec2(t, t * .7));
  float n2 = fbm(q * 3. + vec2(-t * .5, t * .3) + n1 * .5);
  float n3 = fbm(q * 1.8 + n2 * .4 + vec2(t * .2, -t * .4));

  vec3 c = vec3(.008, .008, .03);
  c = mix(c, vec3(.04, .06, .2), smoothstep(.25, .55, n1));
  c = mix(c, vec3(.15, .06, .35), smoothstep(.35, .65, n2));
  c += vec3(.1, .22, .6) * pow(max(0., smoothstep(.5, .9, n3)), 2.) * .6;
  c += vec3(.35, .15, .6) * pow(max(0., smoothstep(.6, .95, n2 * n3)), 3.) * .4;
  c += vec3(.2, .4, .9) * pow(max(0., smoothstep(.55, .85, n1 + n2 * .5)), 4.) * .25;

  c += vec3(.1, .18, .5) * exp(-md * md * 3.) * .7;
  c += vec3(.2, .15, .5) * exp(-md * md * 12.) * .35;

  float ct = T - CT;
  if(ct < 4.){
    vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
    float cd = length(q - cp);
    float ring = abs(cd - ct * .7);
    c += vec3(.3, .35, .9) * smoothstep(.08, 0., ring) * exp(-ct * .8) * 1.5;
    c += vec3(.2, .1, .5) * smoothstep(.2, 0., abs(cd - ct * .7 - .15)) * exp(-ct * 1.2) * .5;
  }

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const HORIZON = `
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;

  vec2 tilt = (M - .5) * .25;
  float horizon = -.05 + tilt.y * .2;
  vec3 c = vec3(.008, .005, .025);

  c = mix(c, vec3(.02, .015, .06), smoothstep(horizon - .2, horizon + .6, p.y));

  vec2 sunP = vec2(tilt.x * .4, horizon + .22);
  float sunD = length(p - sunP);
  c += vec3(.2, .08, .4) * exp(-sunD * 3.);
  c += vec3(.08, .15, .5) * exp(-sunD * 6.);
  c += vec3(.4, .2, .7) * exp(-sunD * 15.);
  c += vec3(.7, .5, 1.) * exp(-sunD * 40.) * .5;

  if(p.y > horizon + .05){
    vec2 sp = (p + tilt * .3) * 180.;
    vec2 si = floor(sp);
    float star = h21(si);
    if(star > .97){
      vec2 sf = fract(sp) - .5;
      float sd = length(sf);
      float tw = sin(T * 2. + star * 100.) * .3 + .7;
      c += vec3(.5, .6, 1.) * smoothstep(.1, 0., sd) * tw * (star - .97) * 33. * .35;
    }
  }

  if(p.y < horizon){
    float gy = horizon - p.y;
    float gz = .3 / (gy + .005);
    float gx = (p.x + tilt.x * .5) * gz;
    float t = T * .35;

    float fx = fract(gx * .5 + .5);
    float fz = fract(gz * .08 + t + .5);
    float lx = abs(fx - .5);
    float lz = abs(fz - .5);

    float lineX = smoothstep(max(.008, fwidth(fx) * 1.5), 0., lx - .01);
    float lineZ = smoothstep(max(.008, fwidth(fz) * 1.5), 0., lz - .01);
    float grid = max(lineX, lineZ);

    float fade = exp(-gy * .6) * smoothstep(0., .015, gy);
    vec3 gridCol = vec3(.1, .25, .7);

    float ct = T - CT;
    if(ct < 5.){
      vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
      float cgy = horizon - cp.y;
      if(cgy > .01){
        float cgz = .3 / (cgy + .005);
        float cgx = (cp.x + tilt.x * .5) * cgz;
        float dist = length(vec2(gx - cgx, gz - cgz) * .08);
        float ripple = sin(dist * 15. - ct * 6.) * exp(-ct * 1.) * exp(-dist * .3);
        grid += abs(ripple) * .4;
        gridCol = mix(gridCol, vec3(.4, .2, .8), abs(ripple) * .5);
      }
    }

    c += gridCol * grid * fade * .55;
    c += vec3(.1, .12, .45) * exp(-gy * 18.) * .5;
  }

  c *= .96 + .04 * sin(gl_FragCoord.y * 1.5);
  c *= 1. - dot((uv - .5) * 1.2, (uv - .5) * 1.2);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const VORONOI = `
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .15;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);

  float md = length(p - mp);
  p += (p - mp) * exp(-md * md * 4.) * .35;

  float ct = T - CT;
  if(ct < 4.){
    vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
    float cd = length(p - cp);
    float wave = sin(cd * 12. - ct * 6.) * exp(-ct * 1.2) * .06;
    p += normalize(p - cp + .0001) * wave;
  }

  vec2 sp = p * 5.;
  vec2 ip = floor(sp);
  vec2 fp = fract(sp);

  float md1 = 10., md2 = 10.;
  vec2 mpt = vec2(0.);
  float mid = 0.;

  for(int y = -1; y <= 1; y++){
    for(int x = -1; x <= 1; x++){
      vec2 nb = vec2(float(x), float(y));
      vec2 cell = ip + nb;
      vec2 pt = h22(cell);
      pt = .5 + .4 * sin(t * 3. + pt * TAU);
      vec2 diff = nb + pt - fp;
      float d = length(diff);
      if(d < md1){ md2 = md1; md1 = d; mpt = cell + pt; mid = h21(cell); }
      else if(d < md2){ md2 = d; }
    }
  }

  float edge = md2 - md1;
  vec3 c = mix(vec3(.015, .012, .04), vec3(.025, .015, .05), mid);

  vec3 edgeCol = mix(vec3(.12, .3, .85), vec3(.4, .15, .75), sin(mid * 15.) * .5 + .5);
  c += edgeCol * smoothstep(.12, 0., edge) * .7;
  c += vec3(.3, .45, .95) * smoothstep(.04, 0., edge) * .5;

  float pulse = sin(T * .5 + mid * TAU) * .5 + .5;
  c += edgeCol * .025 * pulse * (1. - smoothstep(.12, 0., edge));

  if(ct < 3.){
    vec2 cp2 = (C - .5) * vec2(R.x / R.y, 1.) * 5.;
    float clickD = length(mpt - cp2 * .8);
    float shatter = exp(-clickD * .4) * exp(-ct * 1.2);
    c += edgeCol * shatter * 1.5;
    float frac = abs(sin(mid * 50. + clickD * 3.));
    c += vec3(.15, .25, .65) * smoothstep(.02, 0., abs(frac - .5) - .4) * shatter * .5;
  }

  float mg2 = length(sp - mp * 5.);
  c += vec3(.04, .08, .22) * exp(-mg2 * mg2 * .08);

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE = `
#define N 16
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .28;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;

  vec2 nodes[N];
  float fireFx[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t * .3 + fi * .5) * .4;
    float rad = .12 + sqrt(fi / float(N)) * .55;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    float n1 = sin(t * 1.1 + fi * 2.7) * cos(t * .8 + fi * 1.9);
    base += vec2(sin(t * 1.3 + fi * 1.5 + n1 * 3.),
                 cos(t * 1.05 + fi * 2.1 + n1 * 3.)) * .11;

    vec2 toM = base - mp;
    float md = length(toM);
    float vortex = exp(-md * md * 1.5);
    vec2 perp = vec2(-toM.y, toM.x);
    base += perp * vortex * sin(T * 1.3) * .18;
    base -= toM * vortex * .12;

    nodes[i] = base;

    float fireDelay = length(base - cp) * 2.4;
    float fireT = ct - fireDelay;
    fireFx[i] = (fireT > 0. && fireT < 2.5)
      ? exp(-fireT * 1.6) * smoothstep(0., .08, fireT) : 0.;
  }

  vec3 c = vec3(.006, .005, .025);
  float nodeGlow = 0.;
  float coreGlow = 0.;
  vec3 lineAccum = vec3(0.);

  const float THRESH = .4;

  for(int i = 0; i < N; i++){
    float fi = float(i);
    float d = length(p - nodes[i]);
    float pls = sin(T * 1.4 + fi * 2.4) * .25 + .75;
    float fb = fireFx[i];
    nodeGlow += .0035 / (d * d + .0006) * pls * (1. + fb * 5.);
    coreGlow += .0006 / (d * d + .00008) * (1. + fb * 8.);

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < THRESH * 1.5){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha = pow(1. - ablen / (THRESH * 1.5), 1.4);
      float lineW = .00055 / (lineD * lineD + .00005);
      vec3 col = mix(vec3(.3, .55, 1.2), vec3(.7, .35, 1.1), fract(fi * .41));
      lineAccum += col * lineW * alpha * 1.4;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i], b = nodes[j];
      vec2 ab2 = b - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < THRESH){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha = pow(1. - ablen_2 / THRESH, 1.5);

        float flow = sin(tp * 14. - T * 3. + fi * 2.) * .5 + .5;
        flow = pow(flow, 5.);

        float fbi = fireFx[i], fbj = fireFx[j];
        float boltI = fbi > .001
          ? smoothstep(.15, 0., abs(tp - (1. - fbi * 1.1))) * fbi * 4. : 0.;
        float boltJ = fbj > .001
          ? smoothstep(.15, 0., abs(tp - fbj * 1.1)) * fbj * 4. : 0.;
        float edgeFire = max(fbi, fbj) * 2.;

        float lineW = .00045 / (lineD * lineD + .00004);
        vec3 col = mix(vec3(.15, .35, 1.), vec3(.55, .18, .98),
                       fract(fi * .31 + float(j) * .77));
        vec3 fireCol = vec3(.7, .85, 1.3);
        lineAccum += col * lineW * alpha * (1. + flow * 1.6 + edgeFire);
        lineAccum += fireCol * lineW * alpha * (boltI + boltJ);
      }
    }
  }

  c += vec3(.3, .5, 1.) * nodeGlow * .16;
  c += vec3(.75, .85, 1.) * pow(coreGlow, 1.1) * 2.5;
  c += lineAccum * .42;

  float bg = fbm(p * 2.2 + t * .25);
  c += vec3(.025, .035, .11) * bg * .5;

  c += vec3(.08, .14, .5) * exp(-length(p - mp) * 2.4) * .3;

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE_NOIR = `
#define N 14
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .25;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;
  float glitch = ct < 1.8 ? exp(-ct * 2.2) : 0.;

  vec2 nodes[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t * .3 + fi * .5) * .35;
    float rad = .14 + sqrt(fi / float(N)) * .52;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    base += vec2(sin(t * 1.3 + fi * 1.7),
                 cos(t * 1.05 + fi * 2.3)) * .08;
    vec2 toM = mp - base;
    float md = length(toM);
    base += toM * exp(-md * md * 1.8) * .14;
    nodes[i] = base;
  }

  vec3 c = vec3(.005, .003, .02);
  float nodeGlow = 0.;
  float coreGlow = 0.;
  vec3 lineAccum = vec3(0.);

  for(int i = 0; i < N; i++){
    float fi = float(i);
    float d = length(p - nodes[i]);
    float pls = sin(T * 1.5 + fi * 2.4) * .3 + .7;
    nodeGlow += .0035 / (d * d + .0006) * pls;
    coreGlow += .0008 / (d * d + .00008);

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < .6){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha = pow(1. - ablen / .6, 1.4);
      float lineW = .00055 / (lineD * lineD + .00005);
      vec3 col = mix(vec3(0., .85, 1.1), vec3(1., .18, .85), fract(fi * .41));
      lineAccum += col * lineW * alpha * 1.5;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i];
      vec2 ab2 = nodes[j] - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < .42){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha = pow(1. - ablen_2 / .42, 1.5);
        float flow = sin(tp * 14. - T * 3.5 + fi * 2.) * .5 + .5;
        flow = pow(flow, 4.);

        float chromaPulse = 0.;
        if(glitch > .01){
          float dc = min(length(nodes[i] - cp), length(nodes[j] - cp));
          float ringT = ct * 1.4;
          chromaPulse = exp(-abs(dc - ringT) * 4.5) * glitch * 4.;
        }

        float pal = fract(fi * .31 + float(j) * .77);
        vec3 col;
        if(pal < .34) col = vec3(0., .9, 1.1);
        else if(pal < .67) col = vec3(1., .15, .8);
        else col = vec3(.45, .2, 1.1);

        float lineW = .00045 / (lineD * lineD + .00004);
        lineAccum += col * lineW * alpha * (1. + flow * 1.4 + chromaPulse);
      }
    }
  }

  c += vec3(.7, .35, 1.) * nodeGlow * .12;
  c += vec3(1., .85, 1.1) * pow(coreGlow, 1.05) * 1.8;
  c += lineAccum * .45;

  c += vec3(.04, .008, .07) * pow(1. - uv.y, 3.) * .8;
  c += vec3(.015, .005, .04) * (.5 + .5 * sin(uv.x * 40. + sin(uv.x * 7.) * 5.)) * pow(1. - uv.y, 6.) * .5;

  c *= .88 + .12 * sin(gl_FragCoord.y * 1.6 + T * 2.);

  if(glitch > .005){
    float dc = length(p - cp);
    float ringT = ct * 1.2;
    float ringR = sin((dc - ringT - .01) * 28.) * exp(-abs(dc - ringT - .01) * 5.5);
    float ringG = sin((dc - ringT) * 28.) * exp(-abs(dc - ringT) * 5.5);
    float ringB = sin((dc - ringT + .01) * 28.) * exp(-abs(dc - ringT + .01) * 5.5);
    c.r += ringR * glitch * .8;
    c.g += ringG * glitch * .35;
    c.b += ringB * glitch * .7;

    float barY = floor(p.y * 14. + T * 6.);
    float barRand = h21(vec2(barY, floor(T * 12.)));
    if(barRand > .7){
      float bar = smoothstep(.4, 0., abs(fract(p.y * 14. + T * 6.) - .5) - .1);
      c.r += bar * glitch * .6;
      c.b += bar * glitch * .4;
    }
  }

  c += vec3(.4, .08, .7) * exp(-length(p - mp) * 2.4) * .35;
  c += vec3(.05, .5, .7) * exp(-length(p - mp) * 5.5) * .3;

  c *= 1. - dot((uv - .5) * 1.4, (uv - .5) * 1.4) * .85;
  c += grain(gl_FragCoord.xy, T) * 1.4;
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE_BLOOM = `
#define N 12
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .25;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;

  vec2 nodes[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t * .4 + fi) * .3;
    float rad = .15 + sqrt(fi / float(N)) * .5;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    base += vec2(sin(t * 1.2 + fi * 1.6),
                 cos(t * .9 + fi * 2.1)) * .1;
    vec2 toM = mp - base;
    float md = length(toM);
    base += toM * exp(-md * md * 1.5) * .16;
    nodes[i] = base;
  }

  vec3 c = vec3(.008, .005, .03);
  float nodeGlow = 0.;
  float coreGlow = 0.;
  vec3 lineAccum = vec3(0.);
  vec3 particleGlow = vec3(0.);

  for(int i = 0; i < N; i++){
    float fi = float(i);
    float d = length(p - nodes[i]);
    float pls = sin(T * 1.3 + fi * 2.4) * .3 + .7;
    nodeGlow += .004 / (d * d + .0006) * pls;
    coreGlow += .0008 / (d * d + .0001);

    for(int pi = 0; pi < 4; pi++){
      float pf = float(pi);
      float pAng = (T * .6 + fi * 1.7 + pf * 1.57) * (1. + pf * .25);
      float pRad = .025 + pf * .013 + .008 * sin(T + fi + pf);
      vec2 partP = nodes[i] + vec2(cos(pAng), sin(pAng)) * pRad;
      float pd = length(p - partP);
      vec3 pcol = mix(vec3(.4, .65, 1.3), vec3(.7, .4, 1.2), fract(fi * .3 + pf * .2));
      particleGlow += pcol * .00006 / (pd * pd + .00002);
    }

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < .6){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha = pow(1. - ablen / .6, 1.4);
      float lineW = .00055 / (lineD * lineD + .00005);
      vec3 col = mix(vec3(.35, .6, 1.2), vec3(.7, .4, 1.15), fract(fi * .41));
      lineAccum += col * lineW * alpha * 1.5;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i];
      vec2 ab2 = nodes[j] - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < .42){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha = pow(1. - ablen_2 / .42, 1.4);

        float spark = 0.;
        for(int s = 0; s < 3; s++){
          float sf = float(s);
          float phase = fract(T * .55 + fi * .3 + sf * .333);
          float sparkD = abs(tp - phase);
          spark += smoothstep(.05, 0., sparkD)
                 * smoothstep(0., .12, phase) * smoothstep(1., .88, phase);
        }

        float clickSpark = 0.;
        if(ct < 3.){
          float dc = min(length(nodes[i] - cp), length(nodes[j] - cp));
          float arrived = smoothstep(0., .1, ct - dc * 1.4);
          for(int s = 0; s < 4; s++){
            float sf = float(s);
            float ph = fract(ct * 1.8 - dc * .8 + sf * .25);
            clickSpark += smoothstep(.04, 0., abs(tp - ph)) * arrived;
          }
          clickSpark *= exp(-ct * .9);
        }

        float lineW = .00045 / (lineD * lineD + .00004);
        vec3 col = mix(vec3(.2, .4, 1.15), vec3(.55, .25, 1.05),
                       fract(fi * .31 + float(j) * .77));
        lineAccum += col * lineW * alpha * (1. + spark * 5.);
        lineAccum += vec3(.85, .9, 1.3) * lineW * alpha * clickSpark * 3.;
      }
    }
  }

  c += vec3(.35, .55, 1.) * nodeGlow * .14;
  c += vec3(.95, .9, 1.15) * pow(coreGlow, 1.) * 2.4;
  c += lineAccum * .42;
  c += particleGlow * .9;

  float bg = fbm(p * 2.5 + t * .3);
  c += vec3(.03, .05, .15) * bg * .6;

  if(ct < 2.){
    float dc = length(p - cp);
    float ringT = ct * 1.3;
    float ringW = .03 + ct * .04;
    float ring = exp(-abs(dc - ringT) * (1. / ringW));
    float dots = pow(abs(sin(atan(p.y - cp.y, p.x - cp.x) * 32. + T * 4.)), 25.);
    c += vec3(.5, .7, 1.3) * ring * (.3 + dots * 1.5) * exp(-ct * 1.1);
  }

  c += vec3(.12, .18, .5) * exp(-length(p - mp) * 2.4) * .3;

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE_CONSTELLATION = `
#define N 10
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .14;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;

  vec2 nodes[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t + fi) * .2;
    float rad = .18 + sqrt(fi / float(N)) * .5;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    base += vec2(sin(t + fi * 1.5),
                 cos(t * .8 + fi * 1.8)) * .06;
    vec2 toM = mp - base;
    float md = length(toM);
    base += toM * exp(-md * md * 1.2) * .12;
    nodes[i] = base;
  }

  vec3 c = vec3(.005, .005, .025);

  vec2 starP = p * 80.;
  vec2 si = floor(starP);
  float starH = h21(si);
  if(starH > .985){
    vec2 sf = fract(starP) - .5;
    float sd = length(sf);
    float tw = sin(T * 2. + starH * 100.) * .35 + .65;
    c += vec3(.5, .6, 1.) * smoothstep(.13, 0., sd) * tw * .4;
  }
  vec2 starP2 = p * 200.;
  vec2 si2 = floor(starP2);
  float starH2 = h21(si2 + 31.7);
  if(starH2 > .995){
    c += vec3(.4, .5, .9) * .15;
  }

  float starGlow = 0.;
  float crossGlow = 0.;
  vec3 lineAccum = vec3(0.);

  for(int i = 0; i < N; i++){
    float fi = float(i);
    vec2 toN = p - nodes[i];
    float d = length(toN);
    float pls = sin(T * 1.2 + fi * 2.4) * .25 + .75;

    starGlow += .0008 / (d * d + .00004) * pls;
    float cross1 = exp(-abs(toN.x) * 80. - abs(toN.y) * 4.);
    float cross2 = exp(-abs(toN.y) * 80. - abs(toN.x) * 4.);
    crossGlow += (cross1 + cross2) * pls * .25;

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < .7){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha = pow(1. - ablen / .7, 1.6);
      float lineW = .0004 / (lineD * lineD + .00004);
      vec3 col = mix(vec3(.4, .6, 1.2), vec3(.7, .4, 1.2), fract(fi * .41));
      lineAccum += col * lineW * alpha;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i];
      vec2 ab2 = nodes[j] - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < .5){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha = pow(1. - ablen_2 / .5, 1.5);
        float lineW = .00035 / (lineD * lineD + .00004);
        vec3 col = mix(vec3(.18, .35, 1.), vec3(.5, .2, 1.),
                       fract(fi * .31 + float(j) * .77));
        lineAccum += col * lineW * alpha * .85;
      }
    }
  }

  if(ct < 1.5){
    float minD = 100.;
    int nearI = 0;
    for(int i = 0; i < N; i++){
      float dN = length(nodes[i] - cp);
      if(dN < minD){ minD = dN; nearI = i; }
    }
    vec2 segA = cp;
    vec2 segB = nodes[nearI];
    vec2 ab = segB - segA;
    float ablen = length(ab) + .0001;
    float tp = clamp(dot(p - segA, ab) / dot(ab, ab), 0., 1.);
    vec2 along = segA + ab * tp;
    vec2 perp = vec2(-ab.y, ab.x) / ablen;
    float jit = (fbm(vec2(tp * 12., T * 3.)) - .5) * .03
              + (fbm(vec2(tp * 40., T * 5.)) - .5) * .012;
    vec2 closest = along + perp * jit;
    float lineD = length(p - closest);
    float boltFade = exp(-ct * 2.5) * smoothstep(1.5, 0., ct);
    c += vec3(.7, .9, 1.6) * exp(-lineD * 90.) * boltFade;
    c += vec3(.3, .45, 1.1) * exp(-lineD * 22.) * boltFade * .35;

    float burstX = exp(-abs(p.x - cp.x) * 55. - abs(p.y - cp.y) * 4.);
    float burstY = exp(-abs(p.y - cp.y) * 55. - abs(p.x - cp.x) * 4.);
    float burstDiag1 = exp(-abs((p.x - cp.x) + (p.y - cp.y)) * 55. - abs((p.x - cp.x) - (p.y - cp.y)) * 5.);
    float burstDiag2 = exp(-abs((p.x - cp.x) - (p.y - cp.y)) * 55. - abs((p.x - cp.x) + (p.y - cp.y)) * 5.);
    c += vec3(.75, .85, 1.5) * (burstX + burstY) * exp(-ct * 2.5);
    c += vec3(.4, .55, 1.2) * (burstDiag1 + burstDiag2) * exp(-ct * 2.5) * .6;
    float cd = length(p - cp);
    c += vec3(.3, .4, 1.) * exp(-cd * cd * 28.) * exp(-ct * 2.) * .8;

    float strikeD = length(p - segB);
    c += vec3(.6, .8, 1.5) * exp(-strikeD * strikeD * 250.) * boltFade * 1.5;
  }

  c += vec3(.45, .6, 1.15) * starGlow * .22;
  c += vec3(.95, .95, 1.15) * pow(starGlow * .14, 1.5) * 2.;
  c += vec3(.55, .7, 1.2) * crossGlow * .3;
  c += lineAccum * .4;

  float bg = fbm(p * 1.5 + t * .2);
  c += vec3(.02, .015, .06) * bg * .8;
  c += vec3(.025, .01, .05) * pow(fbm(p * .8 - t * .1), 2.) * 1.2;

  c += vec3(.08, .12, .4) * exp(-length(p - mp) * 2.5) * .25;

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE_VAPOR = `
#define N 10
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .14;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;

  vec2 nodes[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t + fi) * .2;
    float rad = .18 + sqrt(fi / float(N)) * .5;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    base += vec2(sin(t + fi * 1.5),
                 cos(t * .8 + fi * 1.8)) * .06;
    vec2 toM = mp - base;
    float md = length(toM);
    base += toM * exp(-md * md * 1.2) * .12;
    nodes[i] = base;
  }

  vec3 c = vec3(.006, .003, .025);

  vec2 starP = p * 80.;
  vec2 si = floor(starP);
  float starH = h21(si);
  if(starH > .985){
    vec2 sf = fract(starP) - .5;
    float sd = length(sf);
    float tw = sin(T * 2. + starH * 100.) * .35 + .65;
    vec3 starCol = mix(vec3(0., .9, 1.1), vec3(1., .25, .9), step(.5, starH));
    c += starCol * smoothstep(.13, 0., sd) * tw * .4;
  }
  vec2 starP2 = p * 200.;
  vec2 si2 = floor(starP2);
  float starH2 = h21(si2 + 31.7);
  if(starH2 > .995){
    c += vec3(.5, .25, .85) * .15;
  }

  float starGlow = 0.;
  vec3 starColAcc = vec3(0.);
  vec3 lineAccum = vec3(0.);

  for(int i = 0; i < N; i++){
    float fi = float(i);
    vec2 toN = p - nodes[i];
    float d = length(toN);
    float pls = sin(T * 1.2 + fi * 2.4) * .25 + .75;

    starGlow += .0008 / (d * d + .00004) * pls;
    float cross1 = exp(-abs(toN.x) * 80. - abs(toN.y) * 4.);
    float cross2 = exp(-abs(toN.y) * 80. - abs(toN.x) * 4.);

    float nh = fract(fi * .41);
    vec3 nodeCol;
    if(nh < .34) nodeCol = vec3(0., .95, 1.15);
    else if(nh < .67) nodeCol = vec3(1., .2, .85);
    else nodeCol = vec3(.5, .25, 1.15);
    starColAcc += nodeCol * (.0008 / (d * d + .00004)) * pls;
    starColAcc += nodeCol * (cross1 + cross2) * pls * .32;

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < .7){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha = pow(1. - ablen / .7, 1.6);
      float lineW = .0004 / (lineD * lineD + .00004);
      vec3 col = mix(vec3(0., .85, 1.1), vec3(1., .18, .85), fract(fi * .41));
      lineAccum += col * lineW * alpha * 1.2;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i];
      vec2 ab2 = nodes[j] - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < .5){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha = pow(1. - ablen_2 / .5, 1.5);
        float lineW = .00035 / (lineD * lineD + .00004);
        float pal = fract(fi * .31 + float(j) * .77);
        vec3 col;
        if(pal < .34) col = vec3(0., .9, 1.1);
        else if(pal < .67) col = vec3(1., .15, .8);
        else col = vec3(.45, .2, 1.1);
        lineAccum += col * lineW * alpha * .85;
      }
    }
  }

  if(ct < 1.5){
    float minD = 100.;
    int nearI = 0;
    for(int i = 0; i < N; i++){
      float dN = length(nodes[i] - cp);
      if(dN < minD){ minD = dN; nearI = i; }
    }
    vec2 segA = cp;
    vec2 segB = nodes[nearI];
    vec2 ab = segB - segA;
    float ablen = length(ab) + .0001;
    float tp = clamp(dot(p - segA, ab) / dot(ab, ab), 0., 1.);
    vec2 along = segA + ab * tp;
    vec2 perp = vec2(-ab.y, ab.x) / ablen;
    float jit = (fbm(vec2(tp * 12., T * 3.)) - .5) * .03
              + (fbm(vec2(tp * 40., T * 5.)) - .5) * .012;
    vec2 closest = along + perp * jit;
    float lineD = length(p - closest);
    float boltFade = exp(-ct * 2.5) * smoothstep(1.5, 0., ct);
    float lineDcyan = length(p - (closest - perp * .004));
    float lineDpink = length(p - (closest + perp * .004));
    c += vec3(0., .95, 1.2) * exp(-lineDcyan * 90.) * boltFade;
    c += vec3(1., .2, .9) * exp(-lineDpink * 90.) * boltFade;
    c += vec3(.5, .3, 1.) * exp(-lineD * 22.) * boltFade * .4;

    float burstX = exp(-abs(p.x - cp.x) * 55. - abs(p.y - cp.y) * 4.);
    float burstY = exp(-abs(p.y - cp.y) * 55. - abs(p.x - cp.x) * 4.);
    float burstDiag1 = exp(-abs((p.x - cp.x) + (p.y - cp.y)) * 55. - abs((p.x - cp.x) - (p.y - cp.y)) * 5.);
    float burstDiag2 = exp(-abs((p.x - cp.x) - (p.y - cp.y)) * 55. - abs((p.x - cp.x) + (p.y - cp.y)) * 5.);
    c += vec3(0., .9, 1.2) * (burstX + burstY) * exp(-ct * 2.5);
    c += vec3(1., .3, .9) * (burstDiag1 + burstDiag2) * exp(-ct * 2.5) * .85;
    float cd = length(p - cp);
    c += vec3(.5, .2, 1.) * exp(-cd * cd * 28.) * exp(-ct * 2.) * .9;

    float strikeD = length(p - segB);
    c += vec3(.2, .85, 1.3) * exp(-strikeD * strikeD * 250.) * boltFade * 1.4;
  }

  c += starColAcc * .22;
  c += vec3(1., .95, 1.1) * pow(starGlow * .14, 1.5) * 1.6;
  c += lineAccum * .4;

  float bg = fbm(p * 1.5 + t * .2);
  c += vec3(.04, .006, .06) * bg * .8;
  c += vec3(.005, .02, .055) * pow(fbm(p * .8 - t * .1), 2.) * 1.2;

  c += vec3(.4, .08, .7) * exp(-length(p - mp) * 2.5) * .3;
  c += vec3(.05, .45, .65) * exp(-length(p - mp) * 5.5) * .25;

  c *= .93 + .07 * sin(gl_FragCoord.y * 1.6);

  c *= 1. - dot((uv - .5) * 1.3, (uv - .5) * 1.3);
  c += grain(gl_FragCoord.xy, T);
  O = vec4(max(c, 0.), 1.);
}`;

  const SYNAPSE_VAPOR_DRIVE = `
#define N 10
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = (gl_FragCoord.xy - R * .5) / R.y;
  float t = T * .14;

  vec2 mp = (M - .5) * vec2(R.x / R.y, 1.);
  vec2 cp = (C - .5) * vec2(R.x / R.y, 1.);
  float ct = T - CT;

  vec2 nodes[N];
  for(int i = 0; i < N; i++){
    float fi = float(i);
    float ang = fi * 1.618 * TAU + sin(t + fi) * .2;
    float rad = .18 + sqrt(fi / float(N)) * .5;
    vec2 base = vec2(cos(ang), sin(ang)) * rad * vec2(R.x / R.y * .9, 1.);
    base += vec2(sin(t + fi * 1.5),
                 cos(t * .8 + fi * 1.8)) * .06;
    vec2 toM = mp - base;
    float md = length(toM);
    base += toM * exp(-md * md * 1.2) * .12;
    nodes[i] = base;
  }

  vec3 c = vec3(0.);
  float ambient = .1;

  vec2 starP = p * 80.;
  vec2 si = floor(starP);
  float starH = h21(si);
  if(starH > .985){
    vec2 sf = fract(starP) - .5;
    float sd = length(sf);
    float tw = sin(T * 2. + starH * 100.) * .35 + .65;
    vec3 starCol = mix(vec3(0., .9, 1.1), vec3(1., .25, .9), step(.5, starH));
    c += starCol * smoothstep(.13, 0., sd) * tw * .55;
  }

  float starGlow = 0.;
  vec3 starColAcc = vec3(0.);
  vec3 lineAccum = vec3(0.);

  for(int i = 0; i < N; i++){
    float fi = float(i);
    vec2 toN = p - nodes[i];
    float d = length(toN);
    float pls = sin(T * 1.2 + fi * 2.4) * .25 + .75;

    starGlow += .001 / (d * d + .00004) * pls;
    float cross1 = exp(-abs(toN.x) * 80. - abs(toN.y) * 4.);
    float cross2 = exp(-abs(toN.y) * 80. - abs(toN.x) * 4.);

    float nh = fract(fi * .41);
    vec3 nodeCol;
    if(nh < .34) nodeCol = vec3(0., .95, 1.15);
    else if(nh < .67) nodeCol = vec3(1., .2, .85);
    else nodeCol = vec3(.55, .25, 1.15);
    starColAcc += nodeCol * (.001 / (d * d + .00004)) * pls;
    starColAcc += nodeCol * (cross1 + cross2) * pls * .4;

    vec2 ab = mp - nodes[i];
    float ablen2 = dot(ab, ab);
    float ablen = sqrt(ablen2);
    if(ablen < .7){
      float tp = clamp(dot(p - nodes[i], ab) / max(ablen2, .0001), 0., 1.);
      float lineD = length(p - (nodes[i] + ab * tp));
      float alpha2 = pow(1. - ablen / .7, 1.6);
      float lineW = .0005 / (lineD * lineD + .00004);
      vec3 col = mix(vec3(0., .85, 1.1), vec3(1., .18, .85), fract(fi * .41));
      lineAccum += col * lineW * alpha2 * 1.4;
    }

    for(int j = i + 1; j < N; j++){
      vec2 a = nodes[i];
      vec2 ab2 = nodes[j] - a;
      float ablen2_2 = dot(ab2, ab2);
      float ablen_2 = sqrt(ablen2_2);
      if(ablen_2 < .5){
        float tp = clamp(dot(p - a, ab2) / max(ablen2_2, .0001), 0., 1.);
        float lineD = length(p - (a + ab2 * tp));
        float alpha2 = pow(1. - ablen_2 / .5, 1.5);
        float lineW = .00045 / (lineD * lineD + .00004);
        float pal = fract(fi * .31 + float(j) * .77);
        vec3 col;
        if(pal < .34) col = vec3(0., .9, 1.1);
        else if(pal < .67) col = vec3(1., .15, .8);
        else col = vec3(.45, .2, 1.1);
        lineAccum += col * lineW * alpha2 * 1.;
      }
    }
  }

  if(ct < 1.5){
    float minD = 100.;
    int nearI = 0;
    for(int i = 0; i < N; i++){
      float dN = length(nodes[i] - cp);
      if(dN < minD){ minD = dN; nearI = i; }
    }
    vec2 segA = cp;
    vec2 segB = nodes[nearI];
    vec2 ab = segB - segA;
    float ablen = length(ab) + .0001;
    float tp = clamp(dot(p - segA, ab) / dot(ab, ab), 0., 1.);
    vec2 along = segA + ab * tp;
    vec2 perp = vec2(-ab.y, ab.x) / ablen;
    float jit = (fbm(vec2(tp * 12., T * 3.)) - .5) * .03
              + (fbm(vec2(tp * 40., T * 5.)) - .5) * .012;
    vec2 closest = along + perp * jit;
    float lineD = length(p - closest);
    float boltFade = exp(-ct * 2.5) * smoothstep(1.5, 0., ct);
    float lineDcyan = length(p - (closest - perp * .004));
    float lineDpink = length(p - (closest + perp * .004));
    c += vec3(0., .95, 1.2) * exp(-lineDcyan * 90.) * boltFade;
    c += vec3(1., .2, .9) * exp(-lineDpink * 90.) * boltFade;
    c += vec3(.5, .3, 1.) * exp(-lineD * 22.) * boltFade * .5;

    float burstX = exp(-abs(p.x - cp.x) * 55. - abs(p.y - cp.y) * 4.);
    float burstY = exp(-abs(p.y - cp.y) * 55. - abs(p.x - cp.x) * 4.);
    float burstDiag1 = exp(-abs((p.x - cp.x) + (p.y - cp.y)) * 55. - abs((p.x - cp.x) - (p.y - cp.y)) * 5.);
    float burstDiag2 = exp(-abs((p.x - cp.x) - (p.y - cp.y)) * 55. - abs((p.x - cp.x) + (p.y - cp.y)) * 5.);
    c += vec3(0., .9, 1.2) * (burstX + burstY) * exp(-ct * 2.5) * 1.2;
    c += vec3(1., .3, .9) * (burstDiag1 + burstDiag2) * exp(-ct * 2.5) * 1.;
    float cd = length(p - cp);
    c += vec3(.5, .2, 1.) * exp(-cd * cd * 28.) * exp(-ct * 2.) * 1.;

    float strikeD = length(p - segB);
    c += vec3(.2, .85, 1.3) * exp(-strikeD * strikeD * 250.) * boltFade * 1.6;
  }

  c += starColAcc * .3;
  c += vec3(1., .95, 1.1) * pow(starGlow * .14, 1.5) * 1.8;
  c += lineAccum * .5;

  c += vec3(.4, .08, .7) * exp(-length(p - mp) * 2.5) * .4;
  c += vec3(.05, .45, .65) * exp(-length(p - mp) * 5.5) * .35;

  c *= .92 + .08 * sin(gl_FragCoord.y * 1.6);

  float vig = dot((uv - .5) * 1.4, (uv - .5) * 1.4);
  float lum = dot(c, vec3(.299, .587, .114));
  float alpha = clamp(ambient + pow(lum * 1.4, .65) + vig * .65, 0., 1.);
  c += vec3(.015, .005, .04) * vig * 2.5;

  c += grain(gl_FragCoord.xy, T) * .8;
  O = vec4(max(c, 0.), alpha);
}`;

  const DEFAULT_DRIVE_VIDEO = 'https://cdn.shopify.com/videos/c/o/v/39ce99635f904af785d3e41ac326bcc7.mp4';

  const SHADERS = {
    nebula:        { source: NEBULA,                hasAlpha: false },
    horizon:       { source: HORIZON,               hasAlpha: false },
    voronoi:       { source: VORONOI,               hasAlpha: false },
    synapse:       { source: SYNAPSE,               hasAlpha: false },
    noir:          { source: SYNAPSE_NOIR,          hasAlpha: false },
    bloom:         { source: SYNAPSE_BLOOM,         hasAlpha: false },
    constellation: { source: SYNAPSE_CONSTELLATION, hasAlpha: false },
    vapor:         { source: SYNAPSE_VAPOR,         hasAlpha: false },
    drive:         { source: SYNAPSE_VAPOR_DRIVE,   hasAlpha: true, needsVideo: true },
  };

  window.OmniflexInteractiveWallpapers = { VERT, COMMON, SHADERS, DEFAULT_DRIVE_VIDEO };
})();
