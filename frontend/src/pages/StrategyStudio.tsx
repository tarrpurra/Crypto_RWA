import React, { useState } from "react";

interface Template {
    name: string;
    usdy: number;
    meth: number;
    moe: number;
    apy: string;
    risk: "low" | "medium" | "high" | "custom";
    rebalancing: string;
    aiModel: string;
    frequency: string;
}

export default function StrategyStudio() {
    // Upper Workspace State
    const [strategyName, setStrategyName] = useState("My Strategy");
    const [investAmount, setInvestmentAmount] = useState<number>(100);
    const [usdy, setUsdy] = useState(45);
    const [meth, setMeth] = useState(35);
    const [moe, setMoe] = useState(20);
    const [rebalancing, setRebalancing] = useState("Weekly");
    const [aiModel, setAiModel] = useState("Gemini 3 Pro");
    const [riskTolerance, setRiskTolerance] = useState("Balanced");

    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customPrompt, setCustomPrompt] = useState(
        "// Architect agent behavior here\n// e.g., Maximize yield via mETH pools when volatility drops..."
    );

    const presets: Template[] = [
        { name: "Conservative Yield", usdy: 80, meth: 20, moe: 0, apy: "7.2%", risk: "low", rebalancing: "Monthly", aiModel: "Phi-3.5", frequency: "Monthly" },
        { name: "Balanced Growth", usdy: 50, meth: 50, moe: 0, apy: "8.9%", risk: "medium", rebalancing: "Weekly", aiModel: "Gemini 3 Pro", frequency: "Weekly" },
        { name: "Aggressive Arbitrage", usdy: 30, meth: 40, moe: 30, apy: "12.1%", risk: "high", rebalancing: "Daily", aiModel: "Gemini 3 Pro", frequency: "Daily" },
    ];

    const handleApplyTemplate = (template: Template) => {
        setIsCustomMode(false);
        setStrategyName(template.name);
        setUsdy(template.usdy);
        setMeth(template.meth);
        setMoe(template.moe);
        setRebalancing(template.rebalancing);
        setAiModel(template.aiModel);
        if (template.risk === "low") setRiskTolerance("Conservative");
        if (template.risk === "medium") setRiskTolerance("Balanced");
        if (template.risk === "high") setRiskTolerance("Aggressive");
    };

    const totalAllocation = usdy + meth + moe;

    return (
        <div className="min-h-screen bg-[#0B0A08] text-foreground p-8 font-sans antialiased selection:bg-primary/20">

            {/* Premium Header Block */}
            <div className="max-w-[1600px] mx-auto flex justify-between items-end pb-6 mb-8 border-b border-zinc-900/60">
                <div>
                    <h1 className="text-4xl font-normal tracking-wide text-white font-display">
                        Strategic <span className="text-primary font-medium tracking-wide">Studio</span>
                    </h1>
                    <p className="text-xs text-zinc-500 mt-2.5 tracking-wide font-sans font-medium">
                        Create, test, and compare institutional DeFi yield strategies.
                    </p>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase pb-1">
                    LAST UPDATED: <span className="text-zinc-400 font-medium tracking-normal">Jun 11, 2026, 12:21 AM</span>
                </div>
            </div>

            {/* Main Framework Grid */}
            <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">

                {/* LEFT COLUMN: Custom Configuration Panel */}
                <div className="lg:col-span-7 bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-6 shadow-sm">
                    <div className="flex justify-between items-center border-b border-zinc-900/80 pb-4">
                        <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                            CREATE CUSTOM STRATEGY
                        </h2>
                        <span className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" /> LIVE
                        </span>
                    </div>

                    {/* Form Input Setup */}
                    <div className="space-y-6">

                        {/* STRATEGY NAME & INVESTMENT AMOUNT CONTAINER ROW */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Strategy Name */}
                            <div>
                                <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-2">Strategy Name</label>
                                <input
                                    type="text"
                                    value={strategyName}
                                    onChange={(e) => setStrategyName(e.target.value)}
                                    className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all font-sans tracking-wide"
                                />
                            </div>

                            {/* Investment Amount Input */}
                            <div>
                                <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-2">Amount to Invest</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500 font-mono text-xs pointer-events-none">$</span>
                                    <input
                                        type="number"
                                        value={investAmount || ""}
                                        onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                                        className={`w-full bg-[#0B0A08] border rounded-xl pl-8 pr-4 py-3 text-sm font-mono tracking-wide text-white focus:outline-none transition-all ${investAmount < 50 && investAmount !== 0
                                                ? "border-rose-500/40 focus:border-rose-500/80 focus:ring-1 focus:ring-rose-500/10"
                                                : "border-[#24211A] focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                                            }`}
                                        placeholder="100"
                                    />
                                </div>

                                {/* SEAMLESS VALIDATION ALERTS */}
                                {investAmount < 50 && investAmount !== 0 && (
                                    <p className="text-[10px] font-mono text-rose-400/90 tracking-wide mt-1.5 ml-1 transition-all animate-fadeIn">
                                        ⚠️ Minimum amount to be invested is $50
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Allocation Section */}
                        <div className="space-y-3">
                            <label className="text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium block">Asset Allocation</label>

                            <div className="space-y-5 bg-[#0B0A08] border border-[#24211A] rounded-2xl p-5">
                                {/* USDY Slider */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-200 font-display flex items-center gap-2 font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> USDY
                                        </span>
                                        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1.5 rounded-lg">
                                            <span>{usdy}</span>
                                            <span className="text-zinc-600">%</span>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={usdy}
                                        onChange={(e) => setUsdy(Number(e.target.value))}
                                        className="w-full accent-primary h-[3px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                    />
                                </div>

                                {/* mETH Slider */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-200 font-display flex items-center gap-2 font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> mETH
                                        </span>
                                        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1.5 rounded-lg">
                                            <span>{meth}</span>
                                            <span className="text-zinc-600">%</span>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={meth}
                                        onChange={(e) => setMeth(Number(e.target.value))}
                                        className="w-full accent-primary h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                    />
                                </div>

                                {/* Merchant Moe Slider */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-200 font-display flex items-center gap-2 font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Merchant Moe LP
                                        </span>
                                        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1.5 rounded-lg">
                                            <span>{moe}</span>
                                            <span className="text-zinc-600">%</span>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={moe}
                                        onChange={(e) => setMoe(Number(e.target.value))}
                                        className="w-full accent-primary h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                    />
                                </div>

                                <div className="flex justify-between items-center border-t border-zinc-900 pt-3 text-xs font-mono">
                                    <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-display font-medium">TOTAL</span>
                                    <span className={`text-xs font-mono font-medium rounded-md tracking-wide ${totalAllocation === 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {totalAllocation}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Selectors */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-2">Rebalancing</label>
                                <div className="relative">
                                    <select
                                        value={rebalancing}
                                        onChange={(e) => setRebalancing(e.target.value)}
                                        className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-xs text-zinc-200 focus:outline-none focus:border-primary/60 font-mono appearance-none tracking-wide cursor-pointer"
                                    >
                                        <option>Daily</option>
                                        <option>Weekly</option>
                                        <option>Monthly</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-500 text-[10px]">&darr;</div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-2">AI Model</label>
                                <div className="relative">
                                    <select
                                        value={aiModel}
                                        onChange={(e) => setAiModel(e.target.value)}
                                        className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-xs text-zinc-200 focus:outline-none focus:border-primary/60 font-mono appearance-none tracking-wide cursor-pointer"
                                    >
                                        <option>Gemini 3 Pro</option>
                                        <option>Phi-3.5 Local (Ollama)</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-500 text-[10px]">&darr;</div>
                                </div>
                            </div>
                        </div>

                        {/* Risk Badges */}
                        <div>
                            <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-3">Risk Tolerance</label>
                            <div className="grid grid-cols-3 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setRiskTolerance("Conservative")}
                                    className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${riskTolerance === "Conservative"
                                            ? "border-[#10B981] text-[#10B981] bg-[#10B981]/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                            : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                        }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${riskTolerance === "Conservative" ? "bg-[#10B981] shadow-[0_0_8px_#10B981]" : "bg-zinc-600"
                                        }`} />
                                    Conservative
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setRiskTolerance("Balanced")}
                                    className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${riskTolerance === "Balanced"
                                            ? "border-[#F59E0B] text-[#F59E0B] bg-[#F59E0B]/10 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                                            : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                        }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${riskTolerance === "Balanced" ? "bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]" : "bg-zinc-600"
                                        }`} />
                                    Balanced
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setRiskTolerance("Aggressive")}
                                    className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${riskTolerance === "Aggressive"
                                            ? "border-[#EF4444] text-[#EF4444] bg-[#EF4444]/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                            : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                        }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${riskTolerance === "Aggressive" ? "bg-[#EF4444] shadow-[0_0_8px_#EF4444]" : "bg-zinc-600"
                                        }`} />
                                    Aggressive
                                </button>
                            </div>
                        </div>

                        {/* Recommendation */}
                        <div className="bg-[#0B0A08] border border-[#24211A] rounded-2xl p-4 flex justify-between items-center text-xs font-mono">
                            <span className="text-zinc-400 text-xs tracking-wide">
                                ✨ <span className="text-zinc-500 uppercase tracking-widest text-[9px] ml-1 font-semibold">AI Recommendation:</span> 45% USDY, 35% mETH, 20% LP
                            </span>
                            <button
                                onClick={() => { setUsdy(45); setMeth(35); setMoe(20); setRiskTolerance("Balanced"); }}
                                className="text-primary hover:text-primary/80 transition-colors text-xs font-semibold tracking-wider uppercase ml-2"
                            >
                                Generate
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Strategy Templates Sidebar Grid */}
                <div className="lg:col-span-5">
                    {!isCustomMode ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-zinc-900/80 pb-4">
                                <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                    STRATEGY TEMPLATES
                                </h2>
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-medium">4 PRESETS</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {presets.map((preset, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleApplyTemplate(preset)}
                                        className="bg-[#13110E] border border-[#24211A] rounded-2xl p-5 hover:border-primary/40 transition-all cursor-pointer flex flex-col justify-between h-[210px] group shadow-sm"
                                    >
                                        <div className="space-y-2">
                                            <h3 className="text-base font-normal text-white font-display group-hover:text-primary transition-colors tracking-wide">
                                                {preset.name}
                                            </h3>
                                            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                                {preset.usdy}% USDY · {preset.meth}% mETH
                                            </p>
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-zinc-900/50">
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">APY</span>
                                                    <span className="text-2xl font-semibold font-mono text-primary tracking-tight leading-none">{preset.apy}</span>
                                                </div>
                                                <span className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 border rounded-lg font-medium ${preset.risk === 'low' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-amber-500/20 text-amber-400 bg-amber-500/5'}`}>
                                                    {preset.risk} · {preset.frequency}
                                                </span>
                                            </div>
                                            <button className="w-full text-xs bg-primary text-background font-bold tracking-wider uppercase py-2.5 rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
                                                Use Template
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <div
                                    onClick={() => setIsCustomMode(true)}
                                    className="bg-[#13110E] border border-dashed border-[#24211A] rounded-2xl p-5 hover:border-primary/40 transition-all cursor-pointer flex flex-col justify-between h-[210px] group shadow-sm"
                                >
                                    <div className="space-y-2">
                                        <h3 className="text-base font-normal text-white font-display group-hover:text-primary transition-colors tracking-wide">Custom</h3>
                                        <p className="text-xs text-zinc-500 leading-relaxed font-sans">User-defined custom architecture parameters.</p>
                                    </div>
                                    <div className="space-y-4 pt-4 border-t border-zinc-900/50">
                                        <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-medium">Calculated User-defined</div>
                                        <button className="w-full text-xs font-bold tracking-wider uppercase border border-[#24211A] text-zinc-200 py-2.5 rounded-xl bg-[#0B0A08] group-hover:border-primary/40 group-hover:text-white transition-all shadow-sm">
                                            Build Custom
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-5 space-y-5 flex flex-col h-[420px] shadow-sm">
                            <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                                <div>
                                    <h2 className="text-sm font-medium text-white uppercase font-display tracking-wider">Prompt Architect</h2>
                                    <p className="text-[10px] text-zinc-500 font-sans mt-1 tracking-wide">Inject fine-grained system parameters.</p>
                                </div>
                                <button onClick={() => setIsCustomMode(false)} className="text-[10px] font-mono text-zinc-400 hover:text-white border border-[#24211A] px-2.5 py-1 rounded-lg bg-[#0B0A08] transition-colors">
                                    &larr; Presets
                                </button>
                            </div>
                            <div className="flex-1 flex flex-col space-y-2">
                                <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className="w-full flex-1 bg-[#0B0A08] border border-[#24211A] text-primary font-mono text-xs p-4 rounded-xl focus:outline-none focus:border-primary/40 resize-none leading-relaxed tracking-wide" />
                            </div>
                            <button onClick={() => setIsCustomMode(false)} className="w-full text-xs font-bold tracking-wider uppercase py-3 bg-primary text-background rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
                                Save Configuration
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* LOWER BLOCK 1: BACKTEST STRATEGY SYSTEM PANEL */}
            <div className="max-w-[1600px] mx-auto bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-6 mb-8 shadow-sm">
                <div className="border-b border-zinc-900/80 pb-4">
                    <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                        BACKTEST STRATEGY
                    </h2>
                    <p className="text-[11px] text-zinc-500 mt-1 font-sans">Simulate historical performance vs buy-and-hold baseline.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0B0A08] border border-[#24211A] rounded-xl p-4 text-xs">
                    <div>
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">STRATEGY</span>
                        <div className="text-zinc-200 font-mono font-medium">Default 50/30/20</div>
                    </div>
                    <div>
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">START DATE</span>
                        <div className="text-zinc-200 font-mono">10-12-2025</div>
                    </div>
                    <div>
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">END DATE</span>
                        <div className="text-zinc-200 font-mono">10-06-2026</div>
                    </div>
                    <div className="flex items-end">
                        <button disabled={investAmount < 50} className="w-full py-2 bg-primary text-background font-bold tracking-wider rounded-lg text-[11px] uppercase transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                            Run Backtest
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#0B0A08] border border-[#24211A] p-4 rounded-xl">
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL RETURN</span>
                        <span className="text-xl font-semibold font-mono text-emerald-400 tracking-tight">+4.08%</span>
                    </div>
                    <div className="bg-[#0B0A08] border border-[#24211A] p-4 rounded-xl">
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">SHARPE RATIO</span>
                        <span className="text-xl font-semibold font-mono text-primary tracking-tight">3.23</span>
                    </div>
                    <div className="bg-[#0B0A08] border border-[#24211A] p-4 rounded-xl">
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">MAX DRAWDOWN</span>
                        <span className="text-xl font-semibold font-mono text-zinc-300 tracking-tight">0%</span>
                    </div>
                    <div className="bg-[#0B0A08] border border-[#24211A] p-4 rounded-xl">
                        <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">WIN RATE</span>
                        <span className="text-xl font-semibold font-mono text-zinc-300 tracking-tight">72.5%</span>
                    </div>
                </div>

                <div className="bg-[#0B0A08] border border-[#24211A] rounded-xl p-5 h-[240px] flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                        <span>vs. baseline (buy-and-hold): <span className="text-emerald-400 font-medium">+1.81% outperformance</span></span>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Baseline</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> Custom</span>
                        </div>
                    </div>

                    <div className="w-full flex-1 flex items-end relative py-4">
                        <svg className="w-full h-full overflow-visible">
                            <path d="M 0 140 Q 400 120, 800 110 T 1500 90" fill="none" stroke="#332f24" strokeWidth="1.5" strokeDasharray="4" />
                            <path d="M 0 140 Q 400 100, 800 80 T 1500 40" fill="none" stroke="ml-1 hash" strokeWidth="2" className="stroke-primary" />
                            <circle cx="1485" cy="40" r="3.5" className="fill-primary" />
                        </svg>
                    </div>

                    <div className="flex justify-between text-[9px] font-mono text-zinc-600 border-t border-zinc-900/60 pt-2">
                        <span>12-10</span><span>01-15</span><span>02-20</span><span>03-19</span><span>04-24</span><span>06-09</span>
                    </div>
                </div>
            </div>

            {/* LOWER BLOCK 2: COMPARE STRATEGIES SHEET MATRIX */}
            <div className="max-w-[1600px] mx-auto bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="border-b border-zinc-900/80 pb-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                            COMPARE STRATEGIES
                        </h2>
                        <p className="text-[11px] text-zinc-500 mt-1 font-sans">Risk-adjusted performance metrics parsed across configurations.</p>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 tracking-wider">4 ACTIVE SCHEMAS</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-900 text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
                                <th className="pb-3 font-medium">STRATEGY</th>
                                <th className="pb-3 font-medium text-right">EXPECTED YIELD</th>
                                <th className="pb-3 font-medium text-right">RISK SCORE</th>
                                <th className="pb-3 font-medium text-right">SHARPE Ratio</th>
                                <th className="pb-3 font-medium text-right">WIN RATE</th>
                                <th className="pb-3 font-medium text-center">STATUS</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-mono divide-y divide-zinc-900/60 text-zinc-300">
                            <tr>
                                <td className="py-3.5 font-sans font-medium text-white flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-emerald-400" /> Conservative Yield
                                </td>
                                <td className="py-3.5 text-right font-medium text-primary">7.2%</td>
                                <td className="py-3.5 text-right text-zinc-400">8</td>
                                <td className="py-3.5 text-right text-zinc-400">1.89</td>
                                <td className="py-3.5 text-right text-zinc-400">68%</td>
                                <td className="py-3.5 text-center"><span className="text-[9px] bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded border border-zinc-800">INACTIVE</span></td>
                            </tr>
                            <tr>
                                <td className="py-3.5 font-sans font-medium text-white flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-amber-400" /> Balanced Growth
                                </td>
                                <td className="py-3.5 text-right font-medium text-primary">8.9%</td>
                                <td className="py-3.5 text-right text-zinc-400">14</td>
                                <td className="py-3.5 text-right text-zinc-400">2.34</td>
                                <td className="py-3.5 text-right text-zinc-400">72%</td>
                                <td className="py-3.5 text-center"><span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">ACTIVE</span></td>
                            </tr>
                            <tr>
                                <td className="py-3.5 font-sans font-medium text-white flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-rose-400" /> Aggressive Arbitrage
                                </td>
                                <td className="py-3.5 text-right font-medium text-primary">12.1%</td>
                                <td className="py-3.5 text-right text-zinc-400">28</td>
                                <td className="py-3.5 text-right text-zinc-400">2.78</td>
                                <td className="py-3.5 text-right text-zinc-400">65%</td>
                                <td className="py-3.5 text-center"><span className="text-[9px] bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded border border-zinc-800">INACTIVE</span></td>
                            </tr>
                            <tr>
                                <td className="py-3.5 font-sans font-medium text-white flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-primary" /> {strategyName}
                                </td>
                                <td className="py-3.5 text-right font-medium text-primary">8.55%</td>
                                <td className="py-3.5 text-right text-zinc-400">15.7</td>
                                <td className="py-3.5 text-right text-zinc-400">3.22</td>
                                <td className="py-3.5 text-right text-zinc-400">72.2%</td>
                                <td className="py-3.5 text-center"><span className="text-[9px] bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded border border-zinc-800">INACTIVE</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}