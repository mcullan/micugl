export type EmbedUniformValue = number | readonly number[];

export type EmbedMotionPolicy = 'static-frame' | 'ignore';

export interface EmbedOptions {
    fragment: string;
    uniforms?: Record<string, EmbedUniformValue>;
    clearColor?: readonly [number, number, number, number];
    dpr?: number;
    reducedMotion?: EmbedMotionPolicy;
    saveData?: EmbedMotionPolicy;
    staticFrame?: number;
    contextAttributes?: WebGLContextAttributes;
}

export interface EmbedHandle {
    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;
    animating: boolean;
    destroy: () => void;
}

const VERTEX_SHADER =
    'attribute vec2 a_position;varying vec2 v_uv;'
    + 'void main(){gl_Position=vec4(a_position,0.0,1.0);v_uv=a_position*0.5+0.5;}';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error('micugl/embed: could not create shader');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`micugl/embed: shader compilation failed: ${info ?? ''}`);
    }

    return shader;
}

function badUniform(name: string, value: EmbedUniformValue): Error {
    return new Error(
        `micugl/embed: uniform "${name}" must be a finite number or an array of 2 to 4 finite numbers, `
        + `received ${value}`
    );
}

function setUniform(
    gl: WebGLRenderingContext,
    location: WebGLUniformLocation,
    name: string,
    value: EmbedUniformValue
): void {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw badUniform(name, value);
        }
        gl.uniform1f(location, value);
        return;
    }

    const data = new Float32Array(value);
    if (data.length < 2 || data.length > 4 || !data.every(component => Number.isFinite(component))) {
        throw badUniform(name, value);
    }

    if (data.length === 2) {
        gl.uniform2fv(location, data);
    } else if (data.length === 3) {
        gl.uniform3fv(location, data);
    } else {
        gl.uniform4fv(location, data);
    }
}

export function embed(canvas: HTMLCanvasElement, options: EmbedOptions): EmbedHandle {
    const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        ...options.contextAttributes
    });
    if (!gl) {
        throw new Error('micugl/embed: could not get a WebGL context from the canvas');
    }

    const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, options.fragment);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        throw new Error(`micugl/embed: program link failed: ${info ?? ''}`);
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    for (const [name, value] of Object.entries(options.uniforms ?? {})) {
        const location = gl.getUniformLocation(program, name);
        if (location !== null) {
            setUniform(gl, location, name, value);
        }
    }

    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

    const color = options.clearColor ?? [0, 0, 0, 1];
    gl.clearColor(color[0], color[1], color[2], color[3]);

    const dprCap = options.dpr ?? 2;
    const staticSeconds = (options.staticFrame ?? 0) / 60;

    const still =
        ((options.reducedMotion ?? 'static-frame') === 'static-frame'
            && window.matchMedia(REDUCED_MOTION_QUERY).matches)
        || ((options.saveData ?? 'static-frame') === 'static-frame'
            && navigator.connection?.saveData === true);

    const draw = (seconds: number): void => {
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (timeLocation !== null) {
            gl.uniform1f(timeLocation, seconds);
        }
        if (resolutionLocation !== null) {
            gl.uniform2f(resolutionLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const resize = (): void => {
        const ratio = Math.min(window.devicePixelRatio, dprCap);
        const width = Math.round(window.innerWidth * ratio);
        const height = Math.round(window.innerHeight * ratio);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        gl.viewport(0, 0, width, height);
        if (still) {
            draw(staticSeconds);
        }
    };

    resize();
    window.addEventListener('resize', resize);

    let start: number | null = null;
    let frame = 0;
    const loop = (now: number): void => {
        start ??= now;
        draw((now - start) * 0.001);
        frame = requestAnimationFrame(loop);
    };
    if (!still) {
        frame = requestAnimationFrame(loop);
    }

    return {
        canvas,
        gl,
        animating: !still,
        destroy: (): void => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            gl.deleteBuffer(buffer);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    };
}
