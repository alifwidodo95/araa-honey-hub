import { useEffect, useState } from "react";

const cuteMessages = [
  "Memanen madu manis... 🍯",
  "Menghubungi ratu lebah... 🐝",
  "Menyiapkan sarang madu... 🪹",
  "Menyaring rasa manis alami... ✨",
  "Menghitung lebah pekerja... 🐝"
];

export function LoadingScreen() {
  const [message, setMessage] = useState(cuteMessages[0]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % cuteMessages.length;
      setMessage(cuteMessages[i]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground space-y-5">
      <div className="relative flex items-center justify-center">
        {/* Swirling honey-colored spinner */}
        <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-honey"></div>
        {/* Bouncing bee in the middle */}
        <div className="absolute text-3xl animate-bounce">🐝</div>
      </div>
      <div className="text-center space-y-1">
        <div className="text-sm font-semibold text-honey animate-pulse tracking-wide">
          {message}
        </div>
        <p className="text-[10px] text-muted-foreground tracking-widest uppercase opacity-70">
          Memuat Sistem Araa Honey
        </p>
      </div>
    </div>
  );
}
