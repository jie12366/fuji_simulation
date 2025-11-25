
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
  histogramData
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'color' | 'fx'>('basic');

  return (
    <div className="w-full lg:w-96 bg-[#121212] flex flex-col h-auto lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800 shadow-2xl z-20">
      {/* Header */}
      <div className="p-6 bg-[#181818] border-b border-gray-800">
        <h1 className="text-2xl font-black text-white tracking-widest mb-1">FUJISIM <span className="text-fuji-accent">ULTRA</span></h1>
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold">Advanced Simulation Engine</p>
      </div>

      {/* Histogram & Upload */}
      <div className="px-6 pt-6">
        {histogramData && <Histogram data={histogramData} />}
        
        <label className="block w-full cursor-pointer group mb-6">
          <div className="bg-gray-800 group-hover:bg-gray-700 transition-all text-white text-center py-3 px-4 rounded-lg border border-gray-700 border-dashed group-hover:border-fuji-accent">
            <span className="flex items-center justify-center gap-2 text-sm font-bold">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              IMPORT RAW/JPG
            </span>
            <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
          </div>
        </label>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-800 mx-6 mb-4">
        <TabButton active={activeTab === 'basic'} onClick={() => setActiveTab('basic')} label="基础" />
        <TabButton active={activeTab === 'color'} onClick={() => setActiveTab('color')} label="色彩 HSL" />
        <TabButton active={activeTab === 'fx'} onClick={() => setActiveTab('fx')} label="特效 FX" />
      </div>

      {/* Scrollable Controls Area */}
      <div className="flex-1 overflow-y-auto px-6 custom-scrollbar">
        
        {/* GLOBAL FILM SIMULATION (Always Visible) */}
        <div className="mb-8">
           <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-wider">Profile</div>
           <select
            value={currentFilm}
            onChange={(e) => onFilmChange(e.target.value as FilmSimulation)}
            className="w-full bg-[#222] text-white border border-gray-700 rounded px-3 py-2 mb-3 focus:outline-none focus:border-fuji-accent text-sm font-medium"
          >
            {Object.values(FilmSimulation).map((film) => (
              <option key={film} value={film}>{film}</option>
            ))}
          </select>
          <Slider label="Intensity" value={Math.round(filterIntensity * 100)} min={0} max={100} onChange={(v) => onIntensityChange(v / 100)} unit="%" />
        </div>

        {activeTab === 'basic' && (
          <div className="animate-fadeIn">
            <Slider label="Exposure" value={adjustments.brightness} min={-100} max={100} onChange={(v) => onAdjustmentChange('brightness', v)} />
            <Slider label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={(v) => onAdjustmentChange('contrast', v)} />
            <Slider label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={(v) => onAdjustmentChange('highlights', v)} />
            <Slider label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={(v) => onAdjustmentChange('shadows', v)} />
            <Slider label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={(v) => onAdjustmentChange('saturation', v)} />
          </div>
        )}

        {activeTab === 'color' && (
          <div className="animate-fadeIn pb-4">
             {/* Color Mixer */}
             {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((color) => (
                <div key={color} className="mb-6 p-3 bg-[#1a1a1a] rounded border border-gray-800">
                   <div className="flex items-center gap-2 mb-3">
                     <div className={`w-3 h-3 rounded-full shadow-sm bg-${color === 'magenta' ? 'fuchsia-500' : color === 'cyan' ? 'cyan-400' : color + '-500'}`}></div>
                     <span className="text-xs font-bold uppercase text-gray-300">{color}</span>
                   </div>
                   <div className="space-y-1">
                      <Slider label="Hue" value={adjustments.hsl[color].h} min={-30} max={30} onChange={(v) => onHSLChange(color, 'h', v)} />
                      <Slider label="Sat" value={adjustments.hsl[color].s} min={-100} max={100} onChange={(v) => onHSLChange(color, 's', v)} />
                      <Slider label="Lum" value={adjustments.hsl[color].l} min={-100} max={100} onChange={(v) => onHSLChange(color, 'l', v)} />
                   </div>
                </div>
             ))}
          </div>
        )}

        {activeTab === 'fx' && (
          <div className="animate-fadeIn">
            <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Optics</h4>
                <Slider label="Halation (Bloom)" value={adjustments.halation} min={0} max={100} onChange={(v) => onAdjustmentChange('halation', v)} />
                <Slider label="Vignette" value={adjustments.vignette} min={0} max={100} onChange={(v) => onAdjustmentChange('vignette', v)} />
            </div>
            <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Texture</h4>
                <Slider label="Grain Amount" value={adjustments.grainAmount} min={0} max={100} onChange={(v) => onAdjustmentChange('grainAmount', v)} />
                <Slider label="Grain Roughness" value={adjustments.grainSize} min={1} max={5} onChange={(v) => onAdjustmentChange('grainSize', v)} />
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
            <span className="animate-pulse">RENDERING...</span>
          ) : (
            <>
              EXPORT IMAGE
            </>
          )}
        </button>
      </div>
    </div>
  );
};
