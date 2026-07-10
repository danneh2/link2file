import { NextRequest } from "next/server";
import { exec } from "child_process";
import { spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const maxDuration = 120;

const BIN_DIR = "/tmp/bins";
const YTDLP_PATH = path.join(BIN_DIR, "yt-dlp");

function getFfmpegPath(): string {
  const candidates = [
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("ffmpeg-static") as string;
}

async function ensureYtDlp(): Promise<string> {
  if (fs.existsSync(YTDLP_PATH)) {
    try {
      await execAsync(`"${YTDLP_PATH}" --version`, { timeout: 5000 });
      return YTDLP_PATH;
    } catch {
      try { fs.unlinkSync(YTDLP_PATH); } catch { /* ignore */ }
    }
  }

  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(`yt-dlp download HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(YTDLP_PATH, buf, { mode: 0o755 });

  try {
    await execAsync(`"${YTDLP_PATH}" --version`, { timeout: 5000 });
  } catch (e) {
    throw new Error(`yt-dlp binary won't execute: ${e instanceof Error ? e.message : String(e)}`);
  }

  return YTDLP_PATH;
}

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", png: "image/png", jpg: "image/jpeg",
};

function guessExt(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    const known = Object.keys(MIME_MAP).concat(["avi", "mkv", "flv", "wmv", "m4v", "ts", "ogg", "flac", "aac", "m4a", "gif", "webp"]);
    if (known.includes(ext)) return ext;
  } catch { /* ignore */ }
  return "";
}

function extFromCT(ct: string): string {
  const mime = ct.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
    "image/png": "png", "image/jpeg": "jpg",
  };
  return map[mime] || "";
}

function extractName(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const last = (segs[segs.length - 1] || "").split("?")[0].split("#")[0];
    const dot = last.lastIndexOf(".");
    return (dot > 0 ? last.substring(0, dot) : last) || "converted";
  } catch { return "converted"; }
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().substring(0, 100) || "converted";
}

function spawnAsync(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let stdout = "", stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d; });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `Exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function convertFFmpeg(ffmpeg: string, inp: string, out: string, inExt: string, outExt: string): Promise<void> {
  const isVidIn = ["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv", "m4v"].includes(inExt);
  const isVidOut = ["mp4", "webm", "mov"].includes(outExt);
  const isAudOut = ["mp3", "wav"].includes(outExt);
  const isImgOut = ["png", "jpg"].includes(outExt);

  const a = ["-y", "-i", `"${inp}"`];
  if (isAudOut) {
    a.push("-vn");
    a.push("-acodec", outExt === "mp3" ? "libmp3lame" : "pcm_s16le");
    if (outExt === "mp3") a.push("-q:a", "2");
    else a.push("-ar", "44100");
  } else if (isImgOut) {
    a.push("-vframes", "1", "-q:v", "2");
  } else if (isVidOut) {
    if (isVidIn && inExt === outExt) a.push("-c", "copy");
    else { a.push("-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-ar", "44100"); }
    if (outExt === "mp4") a.push("-movflags", "+faststart");
  }
  a.push(`"${out}"`);

  try {
    await execAsync(`"${ffmpeg}" ${a.join(" ")}`, { timeout: 55000 });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr || "";
    const tail = stderr.split("\n").filter(Boolean).slice(-3).join(" | ");
    throw new Error(`FFmpeg: ${tail || (err instanceof Error ? err.message : "failed")}`);
  }
}

const PH_COOKIES = "# Netscape HTTP Cookie File\n.pornhub.com\tTRUE\t/\tFALSE\t0\taccessAgeDisclaimerPH\t1\n.pornhub.com\tTRUE\t/\tFALSE\t0\tage_verified\t1\n.pornhub.com\tTRUE\t/\tFALSE\t0\tcountry\tUS";

async function tryPornhubDirect(url: string): Promise<{ buffer: Buffer; title: string }> {
  const viewkeyMatch = url.match(/viewkey=([a-zA-Z0-9]+)/i);
  if (!viewkeyMatch) throw new Error("Could not extract video ID from URL");
  const viewkey = viewkeyMatch[1];
  const embedUrl = `https://www.pornhub.com/embed/${viewkey}`;

  const embedRes = await fetch(embedUrl, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": PH_COOKIES,
    },
    redirect: "follow",
  });
  if (!embedRes.ok) throw new Error(`Embed page fetch failed: ${embedRes.status}`);

  const html = await embedRes.text();

  let videoUrl = "";

  // Look for flashvars with video_url inside
  const flashvarsMatch = html.match(/var\s+flashvars\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (flashvarsMatch) {
    try {
      const fv = JSON.parse(flashvarsMatch[1]);
      if (fv.video_url) videoUrl = fv.video_url;
      if (!videoUrl && fv.defaultQuality) videoUrl = fv.defaultQuality;
      if (!videoUrl && fv.mp4) {
        const mp4 = typeof fv.mp4 === "string" ? fv.mp4 : fv.mp4.videoUrl || "";
        if (mp4) videoUrl = mp4;
      }
    } catch { /* ignore */ }
  }

  if (!videoUrl) {
    const patterns = [
      /"video_url"\s*:\s*"([^"]+)"/,
      /"videoUrl"\s*:\s*"([^"]+)"/,
      /video_url\s*=\s*["']([^"']+)/,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) { videoUrl = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"); break; }
    }
  }

  if (!videoUrl) throw new Error("Could not extract video URL from embed page");

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]
    ?.replace(/\s*[-|]\s*PornHub.*$/i, "").trim() || extractName(url);

  const vidRes = await fetch(videoUrl, {
    signal: AbortSignal.timeout(60000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Referer": "https://www.pornhub.com/embed/",
      "Cookie": PH_COOKIES,
    },
    redirect: "follow",
  });
  if (!vidRes.ok) throw new Error(`Video download failed: ${vidRes.status}`);

  const ct = vidRes.headers.get("content-type") || "";
  const buffer = Buffer.from(await vidRes.arrayBuffer());
  if (buffer.length < 5000 || ct.includes("text/html")) {
    // URL returned a page instead of video — fall back to yt-dlp
    throw new Error("Video URL returned non-video content");
  }
  return { buffer, title };
}

async function tryYtDlpRaw(url: string, cookies?: string): Promise<{ buffer: Buffer; title: string }> {
  let bin: string;
  try {
    bin = await ensureYtDlp();
  } catch (e) {
    throw new Error(`yt-dlp setup failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const outTpl = path.join(tmpDir, "v.%(ext)s");

  let referer = "https://www.google.com/";
  try {
    referer = new URL(url).origin + "/";
  } catch { /* use default */ }

  const extraArgs: string[] = [
    "--impersonate", "chrome",
    "--add-header", "Accept-Language: en-US,en;q=0.9",
    "--referer", referer,
  ];
  let cookieFile = "";
  if (cookies && cookies.trim()) {
    cookieFile = path.join(tmpDir, "cookies.txt");
    fs.writeFileSync(cookieFile, cookies.trim(), "utf-8");
    extraArgs.push("--cookies", cookieFile);
  }

  try {
    await spawnAsync(bin, [
      "--no-warnings", "--no-check-certificates", "--no-playlist",
      "-f", "best[ext=mp4]/best", "--merge-output-format", "mp4",
      "-o", outTpl,
      ...extraArgs,
      url,
    ], 45000);

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith("v."));
    if (!files.length) throw new Error("yt-dlp produced no output files");
    const videoPath = path.join(tmpDir, files[0]);
    const buffer = fs.readFileSync(videoPath);

    let title = extractName(url);
    try {
      const { stdout } = await spawnAsync(bin, [
        "--no-warnings", "--no-check-certificates", "--no-playlist",
        "--print", "%(title)s", "--skip-download",
        ...extraArgs,
        url,
      ], 8000);
      const t = stdout.trim().split("\n").pop();
      if (t) title = t;
    } catch { /* use fallback */ }

    return { buffer, title };
  } catch (e) {
    throw new Error(`yt-dlp download failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

async function tryYtDlp(url: string, cookies?: string): Promise<{ buffer: Buffer; title: string }> {
  const isPornhub = /pornhub\.com/i.test(url);
  if (isPornhub) {
    try {
      return await tryPornhubDirect(url);
    } catch {
      // fall through to yt-dlp with cookies
    }
    return tryYtDlpRaw(url, PH_COOKIES);
  }
  return tryYtDlpRaw(url, cookies);
}

async function tryDirect(url: string): Promise<{ buffer: Buffer; ct: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 1000 ? { buffer: buf, ct } : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const format = request.nextUrl.searchParams.get("format");

  if (!url) return Response.json({ error: "Missing url parameter" }, { status: 400 });
  if (!format || !MIME_MAP[format]) return Response.json({ error: "Missing or invalid format" }, { status: 400 });
  try { new URL(url); } catch { return Response.json({ error: "Invalid URL" }, { status: 400 }); }

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "l2f-"));
    let buf: Buffer, inExt: string, name: string;

    const direct = await tryDirect(url);
    if (direct) {
      buf = direct.buffer;
      inExt = guessExt(url) || extFromCT(direct.ct) || "mp4";
      name = extractName(url);
    } else {
      const yt = await tryYtDlp(url);
      buf = yt.buffer;
      inExt = "mp4";
      name = yt.title;
    }

    const inPath = path.join(tmpDir, `in.${inExt}`);
    const outPath = path.join(tmpDir, `out.${format}`);
    fs.writeFileSync(inPath, buf);

    const ffmpeg = getFfmpegPath();
    if (!fs.existsSync(ffmpeg)) return Response.json({ error: "Converter unavailable" }, { status: 500 });

    if (inExt === format) fs.copyFileSync(inPath, outPath);
    else await convertFFmpeg(ffmpeg, inPath, outPath, inExt, format);

    const outBuf = fs.readFileSync(outPath);
    if (!outBuf.length) return Response.json({ error: "Empty output" }, { status: 500 });

    return new Response(outBuf, {
      headers: {
        "Content-Type": MIME_MAP[format],
        "Content-Disposition": `attachment; filename="${sanitize(name)}.${format}"`,
        "Content-Length": String(outBuf.length),
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  } finally {
    if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

export async function POST(request: NextRequest) {
  let body: { url?: string; format?: string; cookies?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url;
  const format = body.format;
  const cookies = body.cookies;

  if (!url) return Response.json({ error: "Missing url parameter" }, { status: 400 });
  if (!format || !MIME_MAP[format]) return Response.json({ error: "Missing or invalid format" }, { status: 400 });
  try { new URL(url); } catch { return Response.json({ error: "Invalid URL" }, { status: 400 }); }

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "l2f-"));
    let buf: Buffer, inExt: string, name: string;

    const direct = await tryDirect(url);
    if (direct) {
      buf = direct.buffer;
      inExt = guessExt(url) || extFromCT(direct.ct) || "mp4";
      name = extractName(url);
    } else {
      const yt = await tryYtDlp(url, cookies);
      buf = yt.buffer;
      inExt = "mp4";
      name = yt.title;
    }

    const inPath = path.join(tmpDir, `in.${inExt}`);
    const outPath = path.join(tmpDir, `out.${format}`);
    fs.writeFileSync(inPath, buf);

    const ffmpeg = getFfmpegPath();
    if (!fs.existsSync(ffmpeg)) return Response.json({ error: "Converter unavailable" }, { status: 500 });

    if (inExt === format) fs.copyFileSync(inPath, outPath);
    else await convertFFmpeg(ffmpeg, inPath, outPath, inExt, format);

    const outBuf = fs.readFileSync(outPath);
    if (!outBuf.length) return Response.json({ error: "Empty output" }, { status: 500 });

    return new Response(outBuf, {
      headers: {
        "Content-Type": MIME_MAP[format],
        "Content-Disposition": `attachment; filename="${sanitize(name)}.${format}"`,
        "Content-Length": String(outBuf.length),
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  } finally {
    if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" } });
}
