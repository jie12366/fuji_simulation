import React, { useState } from 'react';
import { Adjustments, FilmSimulation, HistogramData, HSLAdjustments } from '../types';
import { Histogram } from './Histogram';

interface ControlsProps {
  currentFilm: FilmSimulation;
  onFilmChange: (f: FilmSimulation) => void;
  adjustments: Adjustments;
  onAdjustmentChange: (key: keyof Adjustments, val: number) => void;
  onHSLChange: (color: keyof HSLAdjustments, param: 'h'|'s'|'l', val: number) => void;
  filterIntensity: number;
  onIntensityChange: (val: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  isProcessing: boolean;
  histogramData: HistogramData | null;
  // New AI props
  isAIAnalyzing?: boolean;
  onAIAuto?: () => void;
}

const Slider = ({ label, value, min, max, onChange, unit = '' }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void, unit?: string }) => (
  <div className="mb-4">
    <div className="flex justify-between text-xs text-gray-400 mb-1 font-medium">
      <span>{label}</span>
      <span className="font-mono text-fuji-accent">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fuji-accent hover:accent-white transition-colors"
    />
  </div>
);

const TabButton = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
      active ? 'text-white border-fuji-accent bg-gray-800' : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
    }`}
  >
    {label}
  </button>
);

const HelpModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
    <div className="bg-[#181818] border border-gray-700 text-gray-300 rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="p-6 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">使用指南</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="p-6 space-y-6 text-sm">
        <section>
          <h3 className="text-fuji-accent font-bold mb-2 text-base">📸 核心工作流</h3>
          <p>1. 点击 <strong>导入 RAW/JPG</strong> 上传图片。</p>
          <p>2. 在下拉菜单中选择 <strong>胶片配方</strong>（如 Classic Chrome）。</p>
          <p>3. 使用滑块微调，最后点击底部 <strong>导出图片</strong>。</p>
        </section>
         <section>
          <h3 className="text-fuji-accent font-bold mb-2 text-base">🤖 AI 智能调色</h3>
          <p>点击顶部的 <strong>✨ 一键智能调色</strong>，AI 将分析图片内容、光影和氛围，自动选择最合适的胶片模拟配方并调整各项参数。</p>
        </section>

        <section>
          <h3 className="text-fuji-accent font-bold mb-2 text-base">✨ 高级功能</h3>
          <ul className="list-disc pl-4 space-y-2">
            <li>
              <strong className="text-white">分屏对比 (Split View)：</strong> 
              图片中央有一条隐形的分割线。鼠标悬停在画布上，拖动出现的白色滑块，即可实时对比<span className="text-gray-400">处理前/处理后</span>的效果。
            </li>
            <li>
              <strong className="text-white">HSL 6通道调色：</strong> 
              在“色彩 HSL”标签页中，你可以独立控制红、黄、绿、青、蓝、洋红六种颜色的色相、饱和度和亮度。这是制作风格化色调（如青橙色调）的神器。
            </li>
            <li>
              <strong className="text-white">光晕 (Halation)：</strong> 
              在“特效 FX”标签页中，增加数值可以让高光部分产生柔和的漫射光感，模拟老镜头的梦幻效果。
            </li>
             <li>
              <strong className="text-white">直方图 (Histogram)：</strong> 
              控制面板顶部的图表显示了当前画面的RGB分布。左侧代表暗部，右侧代表亮部。防止过曝或死黑的利器。
            </li>
          </ul>
        </section>
        
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-xs text-gray-400">
          💡 提示：所有处理均在浏览器本地进行，您的图片不会上传到任何服务器（AI 功能除外，AI 功能需将压缩后的图片发送至 Google Gemini 进行分析）。
        </div>
      </div>
      <div className="p-6 border-t border-gray-700">
        <button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-bold transition-colors">
          我知道了
        </button>
      </div>
    </div>
  </div>
);

export const Controls: React.FC<ControlsProps> = ({
  currentFilm,
  onFilmChange,
  adjustments,
  onAdjustmentChange,
  onHSLChange,
  filterIntensity,
  onIntensityChange,
  onUpload,
  onDownload,
  isProcessing,
  histogramData,
  isAIAnalyzing = false,
  onAIAuto
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'color' | 'fx'>('basic');
  const [showHelp, setShowHelp] = useState(false);

  // Translation helpers for HSL
  const colorNames: Record<string, string> = {
    red: '红色',
    yellow: '黄色',
    green: '绿色',
    cyan: '青色',
    blue: '蓝色',
    magenta: '洋红'
  };

  return (
    <>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      
      <div className="w-full lg:w-96 bg-[#121212] flex flex-col h-auto lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800 shadow-2xl z-20">
        {/* Header */}
        <div className="p-6 bg-[#181818] border-b border-gray-800 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest mb-1">FUJISIM <span className="text-fuji-accent">ULTRA</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold">专业胶片模拟引擎</p>
          </div>
          <button 
            onClick={() => setShowHelp(true)}
            className="text-gray-500 hover:text-fuji-accent transition-colors p-1"
            title="使用指南"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        {/* Histogram & Upload */}
        <div className="px-6 pt-6">
          {histogramData && <Histogram data={histogramData} />}
          
          <div className="flex gap-2 mb-6">
             <label className="flex-1 cursor-pointer group">
                <div className="bg-gray-800 group-hover:bg-gray-700 transition-all text-white text-center py-2 px-3 rounded-lg border border-gray-700 border-dashed group-hover:border-fuji-accent h-full flex items-center justify-center">
                <span className="flex items-center justify-center gap-2 text-xs font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    导入图片
                </span>
                <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
                </div>
            </label>

            <button 
                onClick={onAIAuto}
                disabled={isAIAnalyzing || !histogramData} // Disable if processing or no image
                className={`flex-1 relative overflow-hidden group py-2 px-3 rounded-lg border border-transparent transition-all h-full flex items-center justify-center
                    ${(isAIAnalyzing || !histogramData) 
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/50'}
                `}
            >
                {isAIAnalyzing ? (
                    <span className="flex items-center gap-2 text-xs font-bold animate-pulse">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        分析中...
                    </span>
                ) : (
                    <span className="flex items-center gap-2 text-xs font-bold">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                       </svg>
                       AI 智能调色
                    </span>
                )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-800 mx-6 mb-4">
          <TabButton active={activeTab === 'basic'} onClick={() => setActiveTab('basic')} label="基础调整" />
          <TabButton active={activeTab === 'color'} onClick={() => setActiveTab('color')} label="色彩 HSL" />
          <TabButton active={activeTab === 'fx'} onClick={() => setActiveTab('fx')} label="特效 FX" />
        </div>

        {/* Scrollable Controls Area */}
        <div className="flex-1 overflow-y-auto px-6 custom-scrollbar">
          
          {/* GLOBAL FILM SIMULATION (Always Visible) */}
          <div className="mb-8">
             <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-wider">色彩配方 (Profile)</div>
             <select
              value={currentFilm}
              onChange={(e) => onFilmChange(e.target.value as FilmSimulation)}
              className="w-full bg-[#222] text-white border border-gray-700 rounded px-3 py-2 mb-3 focus:outline-none focus:border-fuji-accent text-sm font-medium"
            >
              {Object.values(FilmSimulation).map((film) => (
                <option key={film} value={film}>{film}</option>
              ))}
            </select>
            <Slider label="滤镜强度 (Intensity)" value={Math.round(filterIntensity * 100)} min={0} max={100} onChange={(v) => onIntensityChange(v / 100)} unit="%" />
          </div>

          {activeTab === 'basic' && (
            <div className="animate-fadeIn">
              <Slider label="曝光 (Exposure)" value={adjustments.brightness} min={-100} max={100} onChange={(v) => onAdjustmentChange('brightness', v)} />
              <Slider label="对比度 (Contrast)" value={adjustments.contrast} min={-100} max={100} onChange={(v) => onAdjustmentChange('contrast', v)} />
              <Slider label="高光 (Highlights)" value={adjustments.highlights} min={-100} max={100} onChange={(v) => onAdjustmentChange('highlights', v)} />
              <Slider label="阴影 (Shadows)" value={adjustments.shadows} min={-100} max={100} onChange={(v) => onAdjustmentChange('shadows', v)} />
              <Slider label="饱和度 (Saturation)" value={adjustments.saturation} min={-100} max={100} onChange={(v) => onAdjustmentChange('saturation', v)} />
            </div>
          )}

          {activeTab === 'color' && (
            <div className="animate-fadeIn pb-4">
               {/* Color Mixer */}
               {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((color) => (
                  <div key={color} className="mb-6 p-3 bg-[#1a1a1a] rounded border border-gray-800">
                     <div className="flex items-center gap-2 mb-3">
                       <div className={`w-3 h-3 rounded-full shadow-sm bg-${color === 'magenta' ? 'fuchsia-500' : color === 'cyan' ? 'cyan-400' : color + '-500'}`}></div>
                       <span className="text-xs font-bold uppercase text-gray-300">{colorNames[color]} ({color})</span>
                     </div>
                     <div className="space-y-1">
                        <Slider label="色相 (Hue)" value={adjustments.hsl[color].h} min={-30} max={30} onChange={(v) => onHSLChange(color, 'h', v)} />
                        <Slider label="饱和 (Sat)" value={adjustments.hsl[color].s} min={-100} max={100} onChange={(v) => onHSLChange(color, 's', v)} />
                        <Slider label="明度 (Lum)" value={adjustments.hsl[color].l} min={-100} max={100} onChange={(v) => onHSLChange(color, 'l', v)} />
                     </div>
                  </div>
               ))}
            </div>
          )}

          {activeTab === 'fx' && (
            <div className="animate-fadeIn">
              <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">光学特效 (Optics)</h4>
                  <Slider label="光晕 (Halation/Bloom)" value={adjustments.halation} min={0} max={100} onChange={(v) => onAdjustmentChange('halation', v)} />
                  <Slider label="暗角 (Vignette)" value={adjustments.vignette} min={0} max={100} onChange={(v) => onAdjustmentChange('vignette', v)} />
              </div>
              <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">胶片质感 (Texture)</h4>
                  <Slider label="颗粒强度 (Amount)" value={adjustments.grainAmount} min={0} max={100} onChange={(v) => onAdjustmentChange('grainAmount', v)} />
                  <Slider label="颗粒大小 (Size)" value={adjustments.grainSize} min={1} max={5} onChange={(v) => onAdjustmentChange('grainSize', v)} />
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="p-6 bg-[#181818] border-t border-gray-800">
          <button
            onClick={onDownload}
            disabled={isProcessing}
            className={`w-full py-4 px-6 rounded font-black text-fuji-900 transition-all transform active:scale-[0.98] flex justify-center items-center gap-3 shadow-[0_0_20px_rgba(0,208,132,0.2)] hover:shadow-[0_0_30px_rgba(0,208,132,0.4)]
              ${isProcessing ? 'bg-gray-600 cursor-not-allowed' : 'bg-fuji-accent hover:bg-[#00e090]'}
            `}
          >
            {isProcessing ? (
              <span className="animate-pulse">处理中 RENDERING...</span>
            ) : (
              <>
                导出图片 (EXPORT)
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};