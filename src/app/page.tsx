"use client";

import { useState, useCallback } from "react";
import {
  Zap,
  Link2,
  ArrowRight,
  Download,
  Loader2,
  FileVideo,
  FileAudio,
  FileImage,
  Check,
  Copy,
  Sparkles,
  Shield,
  Clock,
  AlertCircle,
  Cookie,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const FORMATS = [
  { id: "mp4", label: "MP4", color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileVideo },
  { id: "webm", label: "WebM", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: FileVideo },
  { id: "mov", label: "MOV", color: "bg-sky-100 text-sky-700 border-sky-200", icon: FileVideo },
  { id: "mp3", label: "MP3", color: "bg-green-100 text-green-700 border-green-200", icon: FileAudio },
  { id: "wav", label: "WAV", color: "bg-teal-100 text-teal-700 border-teal-200", icon: FileAudio },
  { id: "png", label: "PNG", color: "bg-orange-100 text-orange-700 border-orange-200", icon: FileImage },
  { id: "jpg", label: "JPG", color: "bg-amber-100 text-amber-700 border-amber-200", icon: FileImage },
];

type Status = "idle" | "converting" | "done" | "error";

export default function Home() {
  const [url, setUrl] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const [cookies, setCookies] = useState("");
  const [showCookies, setShowCookies] = useState(false);

  const handleConvert = useCallback(async () => {
    if (!url.trim()) return;

    setError("");
    setDownloadUrl("");
    setFileName("");
    setStatus("converting");

    try {
      let res: Response;
      if (cookies.trim()) {
        res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            format: selectedFormat,
            cookies: cookies.trim(),
          }),
        });
      } else {
        res = await fetch(
          `/api/convert?url=${encodeURIComponent(url.trim())}&format=${selectedFormat}`
        );
      }

      if (!res.ok) {
        let errMsg = `Conversion failed (${res.status})`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          // use default
        }
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        throw new Error("Converted file is empty");
      }

      let name = `converted.${selectedFormat}`;
      const cd = res.headers.get("content-disposition");
      if (cd) {
        const match = cd.match(/filename="?([^";\n]+)"?/);
        if (match) name = decodeURIComponent(match[1]);
      }

      const objectUrl = URL.createObjectURL(blob);
      setDownloadUrl(objectUrl);
      setFileName(name);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [url, selectedFormat, cookies]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setUrl("");
    setStatus("idle");
    setError("");
    setDownloadUrl("");
    setFileName("");
  };

  return (
    <div className="min-h-screen gradient-bg">
      <main className="pt-16 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-primary bg-accent border-blue-200 mb-6">
              <Sparkles className="w-3 h-3" />
              7 formats &middot; Unlimited &middot; Free
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight mb-4">
              Convert any file
              <br />
              <span className="text-primary">from a URL.</span>
            </h1>
            <p className="text-lg text-muted max-w-xl mx-auto leading-relaxed">
              Paste a link, pick a format, download the result. No account needed.
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8 glow animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {status === "done" ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Conversion complete</h3>
                <p className="text-sm text-muted mb-6">Your file is ready to download</p>
                <div className="bg-accent rounded-xl border border-border p-4 mb-6">
                  <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={handleDownload} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-medium h-12 px-6 hover:bg-primary-hover transition-colors">
                    <Download className="w-4 h-4" />
                    Download File
                  </button>
                  <button onClick={handleReset} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white text-foreground font-medium h-12 px-6 hover:bg-accent transition-colors">
                    Convert Another
                  </button>
                </div>
              </div>
            ) : status === "error" ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Conversion failed</h3>
                <p className="text-sm text-red-600 mb-6 max-w-md mx-auto break-words">{error}</p>
                <button onClick={handleReset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white text-foreground font-medium h-12 px-6 hover:bg-accent transition-colors">
                  Try Again
                </button>
              </div>
            ) : status === "converting" ? (
              <div className="text-center py-8">
                <div className="relative w-16 h-16 mx-auto mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-accent" />
                  <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Converting...</h3>
                <p className="text-sm text-muted">This may take up to a minute for large files</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">File URL</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                      <Link2 className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/video.mp4"
                      className="w-full h-12 pl-10 pr-12 rounded-xl border border-border bg-white text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                      onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) handleConvert(); }}
                    />
                    {url && (
                      <button onClick={handleCopyUrl} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors" title="Copy URL">
                        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowCookies(!showCookies)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                  >
                    <Cookie className="w-3.5 h-3.5" />
                    {showCookies ? "Hide" : "Add"} cookies (for age-restricted / login-required sites)
                    {showCookies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showCookies && (
                    <div className="mt-3">
                      <textarea
                        value={cookies}
                        onChange={(e) => setCookies(e.target.value)}
                        placeholder={"Paste your cookies.txt content here...\n\nHow to get cookies:\n1. Install 'Get cookies.txt LOCALLY' browser extension\n2. Go to the site while logged in (if required)\n3. Export cookies\n4. Paste above\n\nNote: PornHub does NOT require login or cookies."}
                        className="w-full h-32 p-3 rounded-xl border border-border bg-white text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-xs font-mono resize-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">Output Format</label>
                  <div className="flex flex-wrap gap-2">
                    {FORMATS.map((fmt) => {
                      const Icon = fmt.icon;
                      const isSelected = selectedFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          onClick={() => setSelectedFormat(fmt.id)}
                          className={`format-chip inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                            isSelected ? `${fmt.color} ring-2 ring-offset-1 ring-current/20 selected` : "bg-white text-muted border-border hover:border-gray-300"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {fmt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={handleConvert}
                  disabled={!url.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-medium h-12 px-6 hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
                >
                  Convert Now
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-16 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card-hover p-5 rounded-2xl bg-card border border-border">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">Lightning Fast</h3>
                <p className="text-sm text-muted leading-relaxed">Powered by FFmpeg running server-side for reliable, fast conversion.</p>
              </div>
              <div className="card-hover p-5 rounded-2xl bg-card border border-border">
                <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">No Account Needed</h3>
                <p className="text-sm text-muted leading-relaxed">Just paste a URL and convert. No sign-up, no tracking, no limits.</p>
              </div>
              <div className="card-hover p-5 rounded-2xl bg-card border border-border">
                <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">7 Formats</h3>
                <p className="text-sm text-muted leading-relaxed">MP4, WebM, MOV, MP3, WAV, PNG, and JPG — all available instantly.</p>
              </div>
            </div>
          </div>

          <div className="mt-16 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-foreground mb-2">How it works</h2>
              <p className="text-muted">Three steps, zero hassle</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: "01", title: "Paste a URL", desc: "Drop in any publicly accessible file link — video, audio, or image." },
                { step: "02", title: "Choose Format", desc: "Select your target format from 7 options: MP4, MP3, PNG, and more." },
                { step: "03", title: "Download", desc: "We convert it server-side with FFmpeg and serve the result instantly." },
              ].map((item) => (
                <div key={item.step} className="text-center md:text-left">
                  <div className="text-4xl font-black text-blue-100 mb-3">{item.step}</div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">Supported Sites</h2>
                <p className="text-muted text-sm">Works with most sites. Here are some popular ones:</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { name: "YouTube", status: "works" },
                  { name: "TikTok", status: "works" },
                  { name: "Twitter / X", status: "works" },
                  { name: "Instagram", status: "works" },
                  { name: "Vimeo", status: "works" },
                  { name: "Dailymotion", status: "works" },
                  { name: "Facebook", status: "works" },
                  { name: "Reddit", status: "works" },
                ].map((site) => (
                  <div key={site.name} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                    <Check className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">{site.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted text-center mt-5 leading-relaxed">
                Also works with any direct file link (MP4, MP3, PNG, etc.).<br />
                Some sites with age gates or login walls require browser cookies — click the cookie icon below the URL field.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-8 px-4 border-t border-border bg-white/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground text-sm">Link2File</span>
          </div>
          <p className="text-xs text-muted">By Sathvika</p>
        </div>
      </footer>
    </div>
  );
}
