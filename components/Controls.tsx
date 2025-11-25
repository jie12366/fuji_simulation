
import React, { useState } from 'react';
import { Adjustments, FilmSimulation, HistogramData, HSLAdjustments, GradingAdjustments } from '../types';
import { Histogram } from './Histogram';

interface ControlsProps {
  currentFilm: FilmSimulation;
  onFilmChange: (f: FilmSimulation) => void;
  adjustments: Adjustments;
  onAdjustmentChange: (key: keyof Adjustments, val: number) => void;
  onHSLChange: (color: keyof HSLAdjustments, param: 'h'|'s'|'l', val: number) => void;
  onWBChange: (param: 'temp'|'tint', val: number) => void;
  onGradingChange: (region: keyof GradingAdjustments, param: 'h'|'s', val: number) => void;
  
  filterIntensity: number;
  onIntensityChange: (val: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  onBatchUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  
  isProcessing: boolean;
  histogramData: HistogramData | null;
  isAIAnalyzing?: boolean;
  onAIAuto?: (hint: string) => void;
}

const Slider = ({ label, value, min, max, onChange, unit = '', bgClass = 'bg-gray-700' }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void, unit?: string, bgClass?: string }) => (
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
      className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-fuji-accent hover:accent-white transition-colors ${bgClass}`}
    />
  </div>
);

const TabButton = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-2 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
      active ? 'text-white border-fuji-accent bg-gray-800' : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
    }`}
  >
    {label}
  </button>
);

const PRESET_PROMPTS = [
    { label: '自定义 (Custom)', value: '' },
    { label: '🏔️ 专业风光 (Landscape)', value: 'Professional Landscape: High dynamic range, vivid but natural colors, enhance blue skies and green foliage, sharp details.' },
    { label: '👩 电影人像 (Portrait)', value: 'Cinematic Portrait: Flattering skin tones, soft contrast, focus on the subject, slight warm color grading, smooth texture.' },
    { label: '🏙️ 人文街拍 (Street)', value: 'Urban Street Photography: High contrast, gritty texture, dramatic lighting, desaturated cool tones, Leica style.' },
    { label: '🌃 赛博朋克 (Cyberpunk)', value: 'Cyberpunk Night: Neon aesthetics, high halation/bloom, vibrant teal and magenta colors, deep blacks, high contrast.' },
    { label: '🍃 日系空气感 (Airy)', value: 'Japanese Airy Style: High key exposure, low contrast, slightly overexposed, pastel colors, soft dreamy feeling.' },
];

export const Controls: React.FC<ControlsProps> = ({
  currentFilm,
  onFilmChange,
  adjustments,
  onAdjustmentChange,
  onHSLChange,
  onWBChange,
  onGradingChange,
  filterIntensity,
  onIntensityChange,
  onUpload,
  onDownload,
  onBatchUpload,
  onReset,
  isProcessing,
  histogramData,
  isAIAnalyzing = false,
  onAIAuto,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'color' | 'grading' | 'fx'>('basic');
  const [aiPrompt, setAiPrompt] = useState('');

  const colorNames: Record<string, string> = {
    red: '红色', yellow: '黄色', green: '绿色', cyan: '青色', blue: '蓝色', magenta: '洋红'
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setAiPrompt(e.target.value);
  };

  return (
    <>
      <div className="w-full lg:w-96 bg-[#121212] flex flex-col h-auto lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800 shadow-2xl z-20">
        <div className="p-6 bg-[#181818] border-b border-gray-800 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest mb-1">PROGRADE <span className="text-fuji-accent">ULTRA</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold">专业级影像处理平台</p>
          </div>
          <button 
             onClick={onReset}
             title="重置所有参数"
             className="text-xs font-bold text-gray-500 hover:text-white transition-colors bg-gray-800 hover:bg-red-900 px-3 py-1 rounded"
          >
             ↺ 重置
          </button>
        </div>

        <div className="px-6 pt-6">
          {histogramData && <Histogram data={histogramData} />}
          <div className="mb-6 p-1">
             {/* AI Section */}
             <div className="mb-2 space-y-2">
                <select 
                    onChange={handlePresetChange}
                    className="w-full bg-[#1a1a1a] text-gray-400 text-[10px] border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-fuji-accent cursor-pointer"
                >
                    <option value="" disabled selected>⚡️ 快速选择 AI 风格...</option>
                    {PRESET_PROMPTS.map((p, i) => (
                        <option key={i} value={p.value}>{p.label}</option>
                    ))}
                </select>
                <input 
                    type="text" 
                    value={aiPrompt} 
                    onChange={(e) => setAiPrompt(e.target.value)} 
                    placeholder="或输入提示词... (例如: 赛博朋克)" 
                    className="w-full bg-[#1a1a1a] text-gray-300 text-xs border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-fuji-accent transition-colors placeholder-gray-600" 
                />
             </div>
             <div className="flex gap-2 h-10">
                <label className="flex-1 cursor-pointer group h-full">
                    <div className="bg-gray-800 group-hover:bg-gray-700 transition-all text-white text-center rounded-lg border border-gray-700 border-dashed group-hover:border-fuji-accent h-full flex items-center justify-center">
                    <span className="flex items-center justify-center gap-2 text-xs font-bold">📂 导入</span>
                    <input type="file" className="hidden" accept="image/*,.dng,.nef,.arw,.cr2,.orf,.rw2,.raf" onChange={onUpload} />
                    </div>
                </label>
                <button onClick={() => onAIAuto && onAIAuto(aiPrompt)} disabled={isAIAnalyzing || !histogramData} className={`flex-[1.5] relative overflow-hidden group rounded-lg border border-transparent transition-all h-full flex items-center justify-center ${isAIAnalyzing || !histogramData ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg hover:shadow-purple-500/20'}`}>
                    {isAIAnalyzing ? <span className="text-xs font-bold animate-pulse">分析中...</span> : <span className="text-xs font-bold">✨ AI 智能调色</span>}
                </button>
             </div>
          </div>
        </div>

        <div className="flex border-b border-gray-800 mx-6 mb-4">
          <TabButton active={activeTab === 'basic'} onClick={() => setActiveTab('basic')} label="基础" />
          <TabButton active={activeTab === 'color'} onClick={() => setActiveTab('color')} label="HSL" />
          <TabButton active={activeTab === 'grading'} onClick={() => setActiveTab('grading')} label="分级" />
          <TabButton active={activeTab === 'fx'} onClick={() => setActiveTab('fx')} label="特效" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 custom-scrollbar pb-10">
          
          <div className="mb-6 border-b border-gray-800 pb-6">
             <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">配方 (Profile)</div>
             </div>
             <select value={currentFilm} onChange={(e) => onFilmChange(e.target.value as FilmSimulation)} className="w-full bg-[#222] text-white border border-gray-700 rounded px-3 py-2 mb-3 focus:outline-none focus:border-fuji-accent text-sm font-medium">
              {Object.values(FilmSimulation).map((film) => <option key={film} value={film}>{film}</option>)}
            </select>
            <Slider label="强度 (Intensity)" value={Math.round(filterIntensity * 100)} min={0} max={100} onChange={(v) => onIntensityChange(v / 100)} unit="%" />
            
            {/* Main Reset Button */}
            <button 
                onClick={onReset}
                className="w-full mt-2 py-2 text-xs font-bold text-gray-400 bg-gray-800/50 hover:bg-red-900/30 hover:text-red-400 border border-transparent hover:border-red-900/50 rounded transition-all flex items-center justify-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                重置所有参数 (Reset Palette)
            </button>
          </div>

          {activeTab === 'basic' && (
            <div className="animate-fadeIn">
              <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 border-b border-gray-800 pb-1">光影 Tone</h4>
              <Slider label="曝光 (Exposure)" value={adjustments.brightness} min={-100} max={100} onChange={(v) => onAdjustmentChange('brightness', v)} />
              <Slider label="对比度 (Contrast)" value={adjustments.contrast} min={-100} max={100} onChange={(v) => onAdjustmentChange('contrast', v)} />
              <Slider label="高光 (Highlights)" value={adjustments.highlights} min={-100} max={100} onChange={(v) => onAdjustmentChange('highlights', v)} />
              <Slider label="阴影 (Shadows)" value={adjustments.shadows} min={-100} max={100} onChange={(v) => onAdjustmentChange('shadows', v)} />
              <Slider label="饱和度 (Saturation)" value={adjustments.saturation} min={-100} max={100} onChange={(v) => onAdjustmentChange('saturation', v)} />
              
              <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 mt-6 border-b border-gray-800 pb-1">白平衡 White Balance</h4>
              <Slider 
                label="色温 (Temp)" value={adjustments.whiteBalance.temp} min={-50} max={50} 
                onChange={(v) => onWBChange('temp', v)} 
                bgClass="bg-gradient-to-r from-blue-900 via-gray-700 to-yellow-900"
              />
              <Slider 
                label="色调 (Tint)" value={adjustments.whiteBalance.tint} min={-50} max={50} 
                onChange={(v) => onWBChange('tint', v)}
                bgClass="bg-gradient-to-r from-green-900 via-gray-700 to-fuchsia-900" 
              />
            </div>
          )}

          {activeTab === 'color' && (
            <div className="animate-fadeIn pb-4">
               {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((color) => (
                  <div key={color} className="mb-4 p-3 bg-[#1a1a1a] rounded border border-gray-800">
                     <div className="flex items-center gap-2 mb-2">
                       <div className={`w-3 h-3 rounded-full shadow-sm bg-${color === 'magenta' ? 'fuchsia-500' : color === 'cyan' ? 'cyan-400' : color + '-500'}`}></div>
                       <span className="text-xs font-bold uppercase text-gray-300">{colorNames[color]}</span>
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

          {activeTab === 'grading' && (
             <div className="animate-fadeIn pb-4">
                {(['shadows', 'midtones', 'highlights'] as const).map((region) => (
                  <div key={region} className="mb-6">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${region === 'shadows' ? 'bg-gray-800' : region === 'midtones' ? 'bg-gray-500' : 'bg-gray-200'}`}></span>
                      {region === 'shadows' ? '阴影 (Shadows)' : region === 'midtones' ? '中间调 (Midtones)' : '高光 (Highlights)'}
                    </h4>
                    <div className="p-3 bg-[#1a1a1a] rounded border border-gray-800">
                      <Slider 
                        label="色相 (Hue)" 
                        value={adjustments.grading[region].h} 
                        min={0} max={360} 
                        onChange={(v) => onGradingChange(region, 'h', v)} 
                        bgClass="bg-gradient-to-r from-red-500 via-green-500 to-blue-500"
                        unit="°"
                      />
                      <Slider 
                        label="饱和度 (Sat)" 
                        value={adjustments.grading[region].s} 
                        min={0} max={100} 
                        onChange={(v) => onGradingChange(region, 's', v)} 
                      />
                    </div>
                  </div>
                ))}
             </div>
          )}

          {activeTab === 'fx' && (
            <div className="animate-fadeIn">
              <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">光学 (Optics)</h4>
                  <Slider label="光晕 (Halation)" value={adjustments.halation} min={0} max={100} onChange={(v) => onAdjustmentChange('halation', v)} />
                  <Slider label="暗角 (Vignette)" value={adjustments.vignette} min={0} max={100} onChange={(v) => onAdjustmentChange('vignette', v)} />
              </div>
              <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">质感 (Texture)</h4>
                  <Slider label="锐化 (Sharpening)" value={adjustments.sharpening} min={0} max={100} onChange={(v) => onAdjustmentChange('sharpening', v)} />
                  <Slider label="颗粒强度 (Grain)" value={adjustments.grainAmount} min={0} max={100} onChange={(v) => onAdjustmentChange('grainAmount', v)} />
                  <Slider label="颗粒大小 (Size)" value={adjustments.grainSize} min={1} max={5} onChange={(v) => onAdjustmentChange('grainSize', v)} />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-[#181818] border-t border-gray-800">
          <div className="flex gap-2">
             <label className="flex-1 cursor-pointer">
                <div className={`w-full py-4 px-4 rounded font-bold text-xs uppercase tracking-wider text-center border transition-all ${isProcessing ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-[#1a1a1a] text-fuji-accent border-fuji-accent hover:bg-gray-800'}`}>
                    批量处理 (Batch)
                    <input type="file" multiple className="hidden" accept="image/*,.dng,.nef,.arw,.cr2,.orf,.rw2,.raf" onChange={onBatchUpload} disabled={isProcessing} />
                </div>
             </label>
             <button onClick={onDownload} disabled={isProcessing} className={`flex-[2] py-4 px-6 rounded font-black text-fuji-900 transition-all transform active:scale-[0.98] flex justify-center items-center gap-3 shadow-[0_0_20px_rgba(0,208,132,0.2)] hover:shadow-[0_0_30px_rgba(0,208,132,0.4)] ${isProcessing ? 'bg-gray-600 cursor-not-allowed' : 'bg-fuji-accent hover:bg-[#00e090]'}`}>
               {isProcessing ? <span className="animate-pulse">RENDERING...</span> : "导出 (EXPORT)"}
             </button>
          </div>
        </div>
      </div>
    </>
  );
};
