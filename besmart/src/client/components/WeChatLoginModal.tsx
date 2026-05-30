import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function WeChatLoginModal({ onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/oauth/wechat/jssdk-params')
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: 'WeChat not configured' }));
          throw new Error(err.error || 'WeChat not configured');
        }
        return r.json();
      })
      .then(({ data }) => {
        const script = document.createElement('script');
        script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
        script.onload = () => {
          setLoading(false);
          new (window as any).WxLogin({
            self_redirect: false,
            id: 'wechat-qr-container',
            appid: data.appid,
            scope: 'snsapi_login',
            redirect_uri: encodeURIComponent(data.redirect_uri),
            state: data.state,
            style: 'black',
            href: '',
          });
        };
        script.onerror = () => {
          setError('Failed to load WeChat SDK');
          setLoading(false);
        };
        scriptRef.current = script;
        document.head.appendChild(script);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 relative w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>

        <h3 className="text-center font-semibold text-gray-800 mb-4">Sign in with WeChat</h3>

        {loading && (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Loading QR code…
          </div>
        )}

        {error && (
          <div className="h-48 flex items-center justify-center text-sm text-red-500 text-center px-4">
            {error}
          </div>
        )}

        {!error && <div id="wechat-qr-container" className="flex justify-center" />}

        <p className="text-center text-xs text-gray-400 mt-3">
          Open WeChat → Scan QR code to sign in
        </p>
      </div>
    </div>
  );
}
