import React from 'react';

interface BatchModalProps {
  current: number;
  total: number;
  filename: string;
}

export const BatchModal: React.FC<BatchModalProps> = ({ current, total, filename }) => {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-md">
      <div className="w-full max-w-md bg-[#181818] border border-gray-700 rounded-xl p-8 shadow-2xl relative overflow-hidden">
        {/* Animated Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fuji-accent via-blue-500 to-fuji-accent animate-pulse"></div>
        
        <h2 className="text-2xl font-black text-white tracking-wider mb-2">BATCH PROCESSING</h2>
        <div className="flex justify-between items-end mb-4">
            <span className="text-fuji-accent font-mono text-xl">{current} / {total}</span>
            <span className="text-gray-500 text-xs font-mono uppercase">Processing Queue</span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden mb-4 border border-gray-700">
            <div 
                className="h-full bg-fuji-accent transition-all duration-300 ease-out shadow-[0_0_15px_rgba(0,208,132,0.5)]"
                style={{ width: `${percentage}%` }}
            ></div>
        </div>

        <div className="bg-[#121212] p-3 rounded border border-gray-800 flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-fuji-accent animate-ping"></div>
             <p className="text-xs text-gray-400 font-mono truncate">
                Processing: <span className="text-gray-200">{filename}</span>
             </p>
        </div>
        
        <p className="text-[10px] text-center text-gray-600 mt-6 uppercase tracking-widest">
            请勿关闭浏览器窗口 / Do not close window
        </p>
      </div>
    </div>
  );
};