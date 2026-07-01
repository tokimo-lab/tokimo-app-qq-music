import { X } from "lucide-react";
import { useState } from "react";

interface LoginDialogProps {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (cookie: string) => Promise<void>;
}

export function LoginDialog({ open, saving, error, onClose, onSave }: LoginDialogProps) {
  const [cookie, setCookie] = useState("");
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-neutral-950 p-5 text-neutral-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">登录 QQ 音乐</h2>
            <p className="mt-1 text-sm text-neutral-400">从 y.qq.com 登录后复制 Cookie，至少需要包含 uin 或 wxuin。</p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="uin=o123456; qm_keyst=...; qqmusic_key=..."
          className="h-36 w-full resize-none rounded-md border border-white/10 bg-neutral-900 p-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-400"
        />
        {error && <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm text-neutral-300 hover:bg-white/10"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving || !cookie.trim()}
            className="cursor-pointer rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onSave(cookie)}
          >
            {saving ? "验证中" : "保存并登录"}
          </button>
        </div>
      </div>
    </div>
  );
}

