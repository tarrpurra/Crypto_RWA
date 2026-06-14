import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { 
  Undo2, Play, Check, Loader2, ShieldAlert, Wrench, 
  Sparkles, Sliders, ArrowLeft, Database, Network, 
  Activity, Lock, Unlock, Settings, AlertTriangle, Info, LineChart as ChartIcon
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface StrategyConfig {
    name: string;
    promptText: string;
    savedPromptText: string;
    usdy: number;
    meth: number;
    moe: number;
    rebalancing: string;
    aiModel: string;
    riskTolerance: "Conservative" | "Balanced" | "Aggressive";
    investAmount: number;
    
    // Strategic Weights
    llmSentiment: number;
    kellyAggressiveness: number;
    riskSensitivity: "Low" | "Medium" | "High";
    
    // Hard Veto Guardrails
    maxSlippage: number;
    minPoolLiquidity: number; 
    volatilityVeto: boolean;
    unverifiedContractBlock: boolean;
    dailyGasCap: number; 

    // Active Data Sources
    pythOracles: boolean;
    govForumScraper: boolean;
    socialSentiment: boolean;
}

const DEFAULT_PRESETS: Record<string, StrategyConfig> = {
  conservative: {
    name: "Conservative Yield",
    promptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a conservative yield optimizer.\nPrioritize asset safety and low slippage over raw APY.\nLeverage Pyth Network Oracles for strict price feed validation.\nMaintain 80/20 allocation between USDY and mETH.\nVeto pools with less than $5M liquidity.\nExecute rebalancing only during low-volatility gas windows.`,
    savedPromptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a conservative yield optimizer.\nPrioritize asset safety and low slippage over raw APY.\nLeverage Pyth Network Oracles for strict price feed validation.\nMaintain 80/20 allocation between USDY and mETH.\nVeto pools with less than $5M liquidity.\nExecute rebalancing only during low-volatility gas windows.`,
    usdy: 80,
    meth: 20,
    moe: 0,
    rebalancing: "Monthly",
    aiModel: "Phi-3.5 Local (Ollama)",
    riskTolerance: "Conservative",
    investAmount: 100,
    llmSentiment: 15,
    kellyAggressiveness: 0.10,
    riskSensitivity: "High",
    maxSlippage: 0.3,
    minPoolLiquidity: 5000000,
    volatilityVeto: true,
    unverifiedContractBlock: true,
    dailyGasCap: 0.05,
    pythOracles: true,
    govForumScraper: false,
    socialSentiment: false
  },
  balanced: {
    name: "Balanced Growth",
    promptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a balanced growth yield optimizer.\nBalance risk and reward across RWA and blue-chip liquidity.\nLeverage Pyth and Ondo price feeds for dynamic rebalancing.\nMaintain 50/50 allocation between yield stables and mETH.\nVeto pools with <$2M depth.\nExecute trades only during low-volatility gas windows.`,
    savedPromptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a balanced growth yield optimizer.\nBalance risk and reward across RWA and blue-chip liquidity.\nLeverage Pyth and Ondo price feeds for dynamic rebalancing.\nMaintain 50/50 allocation between yield stables and mETH.\nVeto pools with <$2M depth.\nExecute trades only during low-volatility gas windows.`,
    usdy: 50,
    meth: 50,
    moe: 0,
    rebalancing: "Weekly",
    aiModel: "Gemini 3 Pro",
    riskTolerance: "Balanced",
    investAmount: 100,
    llmSentiment: 35,
    kellyAggressiveness: 0.25,
    riskSensitivity: "High",
    maxSlippage: 1.0,
    minPoolLiquidity: 2000000,
    volatilityVeto: true,
    unverifiedContractBlock: true,
    dailyGasCap: 0.15,
    pythOracles: true,
    govForumScraper: true,
    socialSentiment: false
  },
  aggressive: {
    name: "Aggressive Arbitrage",
    promptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as an aggressive arbitrage strategist.\nMaximize yield capturing across all pools including Merchant Moe LP.\nAccept higher slippage for frontrunning profitable yield spikes.\nMaintain 30% USDY, 40% mETH, 30% Merchant Moe LP.\nVeto pools only if depth is below $500k.\nExecute high-frequency rebalancing using local execution.`,
    savedPromptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as an aggressive arbitrage strategist.\nMaximize yield capturing across all pools including Merchant Moe LP.\nAccept higher slippage for frontrunning profitable yield spikes.\nMaintain 30% USDY, 40% mETH, 30% Merchant Moe LP.\nVeto pools only if depth is below $500k.\nExecute high-frequency rebalancing using local execution.`,
    usdy: 30,
    meth: 40,
    moe: 30,
    rebalancing: "Daily",
    aiModel: "Gemini 3 Pro",
    riskTolerance: "Aggressive",
    investAmount: 100,
    llmSentiment: 75,
    kellyAggressiveness: 0.80,
    riskSensitivity: "Medium",
    maxSlippage: 3.0,
    minPoolLiquidity: 500000,
    volatilityVeto: false,
    unverifiedContractBlock: false,
    dailyGasCap: 0.50,
    pythOracles: true,
    govForumScraper: true,
    socialSentiment: true
  },
  custom: {
    name: "My Custom Strategy",
    promptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a custom yield optimizer.\nOptimize allocations according to custom criteria.\n// Enter your custom prompt directives here.\n// e.g. Maximize yield via mETH pools when volatility drops...`,
    savedPromptText: `/**\n * YieldMind Institutional Core Directives\n * Last updated: 2026-06-14 14:38 UTC\n */\nAct as a custom yield optimizer.\nOptimize allocations according to custom criteria.\n// Enter your custom prompt directives here.\n// e.g. Maximize yield via mETH pools when volatility drops...`,
    usdy: 45,
    meth: 35,
    moe: 20,
    rebalancing: "Weekly",
    aiModel: "Gemini 3 Pro",
    riskTolerance: "Balanced",
    investAmount: 100,
    llmSentiment: 50,
    kellyAggressiveness: 0.50,
    riskSensitivity: "Medium",
    maxSlippage: 1.5,
    minPoolLiquidity: 1000000,
    volatilityVeto: true,
    unverifiedContractBlock: true,
    dailyGasCap: 0.20,
    pythOracles: true,
    govForumScraper: false,
    socialSentiment: false
  }
};

export default function StrategyStudio() {
    // Multi-View Navigation State
    const [activeView, setActiveView] = useState<'presets' | 'architect'>('presets');
    const [activePreset, setActivePreset] = useState<keyof typeof DEFAULT_PRESETS>('custom');

    // Strategy parameters configurations
    const [configs, setConfigs] = useState<Record<string, StrategyConfig>>(() => 
      JSON.parse(JSON.stringify(DEFAULT_PRESETS))
    );
    const [savedConfigs, setSavedConfigs] = useState<Record<string, StrategyConfig>>(() => 
      JSON.parse(JSON.stringify(DEFAULT_PRESETS))
    );

    // Active Config reference
    const activeConfig = configs[activePreset];

    // Simulation states
    const [isSimulating, setIsSimulating] = useState(false);
    const [simStep, setSimStep] = useState(0);
    const [showSimResults, setShowSimResults] = useState(false);

    const simulationSteps = [
      "Compiling System Prompt directives...",
      "Validating risk sensitivity against volatility matrix...",
      "Running 10,000 Monte Carlo paths for Kelly optimal sizing...",
      "Evaluating hard veto guardrails against simulated shocks...",
      "Converging yield models and rendering performance graphs..."
    ];

    // Run simulation status cycling
    useEffect(() => {
      let interval: any;
      if (isSimulating) {
        setSimStep(0);
        setShowSimResults(false);
        interval = setInterval(() => {
          setSimStep(prev => {
            if (prev >= simulationSteps.length - 1) {
              clearInterval(interval);
              setIsSimulating(false);
              setShowSimResults(true);
              toast.success("Simulation completed successfully.");
              return prev;
            }
            return prev + 1;
          });
        }, 500);
      }
      return () => clearInterval(interval);
    }, [isSimulating]);

    // Update individual values inside active config
    const updateActiveValue = (key: keyof StrategyConfig, value: any) => {
      setConfigs(prev => ({
        ...prev,
        [activePreset]: {
          ...prev[activePreset],
          [key]: value
        }
      }));
    };

    // Helper to format liquidity
    const formatLiquidity = (value: number) => {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      } else {
        return `$${(value / 1000).toFixed(0)}k`;
      }
    };

    // Calculate dynamic simulated values
    const dynamicApy = (activeConfig.usdy * 0.072 + activeConfig.meth * 0.095 + activeConfig.moe * 0.16) * 
                       (1 + activeConfig.llmSentiment * 0.001) * 
                       (1 + activeConfig.kellyAggressiveness * 0.08);

    const dynamicSharpe = Math.max(0.5, 2.14 - (activeConfig.kellyAggressiveness * 0.4) + (activeConfig.maxSlippage * 0.08));

    // Generate Recharts growth data dynamically
    const generateChartData = () => {
      const data = [];
      const rate = dynamicApy / 100 / 12;
      let balance = activeConfig.investAmount || 1000;
      for (let i = 0; i <= 6; i++) {
        data.push({
          month: `M${i}`,
          balance: Math.round(balance),
          yield: Math.round(balance - (activeConfig.investAmount || 1000))
        });
        balance *= (1 + rate + (Math.random() - 0.5) * 0.005);
      }
      return data;
    };

    // Preset navigation setup in View 1
    const handleUsePreset = (presetKey: keyof typeof DEFAULT_PRESETS) => {
      setActivePreset(presetKey);
      // Synchronize View 1 variables back to config before changing view
      setActiveView('architect');
      toast.info(`Loaded "${DEFAULT_PRESETS[presetKey].name}" configuration template.`);
    };

    // Check if the current config differs from saved config
    const isModified = JSON.stringify(configs[activePreset]) !== JSON.stringify(savedConfigs[activePreset]);

    const handleSave = () => {
      setSavedConfigs(prev => ({
        ...prev,
        [activePreset]: JSON.parse(JSON.stringify(configs[activePreset]))
      }));
      toast.success(`Strategy "${activeConfig.name}" successfully saved and synchronized.`);
    };

    const handleRevertAll = () => {
      setConfigs(prev => ({
        ...prev,
        [activePreset]: JSON.parse(JSON.stringify(savedConfigs[activePreset]))
      }));
      toast.info("All settings reverted to last saved version.");
    };

    const handleRevertPrompt = () => {
      updateActiveValue('promptText', savedConfigs[activePreset].promptText);
      toast.info("Prompt text reverted to last saved version.");
    };

    const handleResetToDefault = () => {
      setConfigs(prev => ({
        ...prev,
        [activePreset]: JSON.parse(JSON.stringify(DEFAULT_PRESETS[activePreset]))
      }));
      toast.info("Reset active configuration to factory default presets.");
    };

    // Line numbering calculation
    const promptLines = activeConfig.promptText.split("\n");
    const lineNumbers = Array.from({ length: Math.max(12, promptLines.length) }, (_, i) => i + 1);

    const totalAllocation = activeConfig.usdy + activeConfig.meth + activeConfig.moe;

    return (
        <div className="min-h-screen bg-[#0B0A08] text-zinc-100 p-8 font-sans antialiased selection:bg-primary/20">
            {/* Premium Header Block */}
            <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-end pb-6 mb-8 border-b border-zinc-900/60 gap-4">
                <div>
                    <h1 className="text-4xl font-normal tracking-wide text-white font-display">
                        Strategic <span className="text-[#D4962A] font-medium tracking-wide">Studio</span>
                        <span className="text-[10px] font-mono text-[#D4962A]/60 bg-[#D4962A]/10 border border-[#D4962A]/20 px-2 py-0.5 rounded ml-3 align-middle">v2.4.1</span>
                    </h1>
                    <p className="text-xs text-zinc-500 mt-2.5 tracking-wide font-sans font-medium">
                        {activeView === 'presets' 
                          ? "Create, test, and compare institutional DeFi yield strategies." 
                          : "Institutional control center for configuring AI reasoning, risk parameters, and execution protocols."
                        }
                    </p>
                </div>
                
                {/* View Switcher Header Toggle */}
                {activeView === 'architect' ? (
                  <div className="flex flex-wrap items-center gap-2 bg-[#13110E] p-1.5 border border-[#24211A] rounded-xl">
                    {(Object.keys(DEFAULT_PRESETS) as Array<keyof typeof DEFAULT_PRESETS>).map((pKey) => {
                      const isActive = activePreset === pKey;
                      const hasUnsaved = JSON.stringify(configs[pKey]) !== JSON.stringify(savedConfigs[pKey]);
                      return (
                        <button
                          key={pKey}
                          onClick={() => setActivePreset(pKey)}
                          className={`px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 border ${
                            isActive 
                              ? "bg-[#D4962A] text-[#150F07] border-[#D4962A] shadow-[0_0_8px_rgba(212,150,42,0.3)]"
                              : "text-zinc-400 bg-transparent border-transparent hover:text-zinc-200"
                          }`}
                        >
                          {DEFAULT_PRESETS[pKey].name}
                          {hasUnsaved && (
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#150F07]" : "bg-[#D4962A] animate-pulse"}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase pb-1">
                      LAST UPDATED: <span className="text-zinc-400 font-medium tracking-normal">Jun 14, 2026, 12:21 AM</span>
                  </div>
                )}
            </div>

            {/* Main Framework Grid */}
            <div className="max-w-[1600px] mx-auto">
                {activeView === 'presets' ? (
                  /* VIEW 1: Allocations & Presets Grid Setup */
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
                      {/* LEFT COLUMN: Custom Configuration Panel */}
                      <div className="lg:col-span-7 bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-6 shadow-sm">
                          <div className="flex justify-between items-center border-b border-zinc-900/80 pb-4">
                              <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                  CREATE CUSTOM STRATEGY
                              </h2>
                              <span className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" /> LIVE
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
                                          value={activeConfig.name}
                                          onChange={(e) => updateActiveValue('name', e.target.value)}
                                          className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4962A]/60 focus:ring-1 focus:ring-[#D4962A]/20 transition-all font-sans tracking-wide"
                                      />
                                  </div>

                                  {/* Investment Amount Input */}
                                  <div>
                                      <label className="block text-[10px] text-zinc-400 tracking-widest uppercase font-display font-medium mb-2">Amount to Invest</label>
                                      <div className="relative">
                                          <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500 font-mono text-xs pointer-events-none">$</span>
                                          <input
                                              type="number"
                                              value={activeConfig.investAmount || ""}
                                              onChange={(e) => updateActiveValue('investAmount', Math.max(0, Number(e.target.value)))}
                                              className={`w-full bg-[#0B0A08] border rounded-xl pl-8 pr-4 py-3 text-sm font-mono tracking-wide text-white focus:outline-none transition-all ${activeConfig.investAmount < 50 && activeConfig.investAmount !== 0
                                                  ? "border-rose-500/40 focus:border-rose-500/80 focus:ring-1 focus:ring-rose-500/10"
                                                  : "border-[#24211A] focus:border-[#D4962A]/60 focus:ring-1 focus:ring-[#D4962A]/20"
                                                  }`}
                                              placeholder="100"
                                          />
                                      </div>

                                      {/* SEAMLESS VALIDATION ALERTS */}
                                      {activeConfig.investAmount < 50 && activeConfig.investAmount !== 0 && (
                                          <p className="text-[10px] font-mono text-rose-400/95 tracking-wide mt-1.5 ml-1 transition-all animate-fadeIn">
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
                                                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4962A]" /> USDY
                                              </span>
                                              <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1 rounded-lg">
                                                  <span>{activeConfig.usdy}</span>
                                                  <span className="text-zinc-600">%</span>
                                              </div>
                                          </div>
                                          <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={activeConfig.usdy}
                                              onChange={(e) => updateActiveValue('usdy', Number(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[3px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                          />
                                      </div>

                                      {/* mETH Slider */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs text-zinc-200 font-display flex items-center gap-2 font-medium">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> mETH
                                              </span>
                                              <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1 rounded-lg">
                                                  <span>{activeConfig.meth}</span>
                                                  <span className="text-zinc-600">%</span>
                                              </div>
                                          </div>
                                          <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={activeConfig.meth}
                                              onChange={(e) => updateActiveValue('meth', Number(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                          />
                                      </div>

                                      {/* Merchant Moe Slider */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs text-zinc-200 font-display flex items-center gap-2 font-medium">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Merchant Moe LP
                                              </span>
                                              <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 bg-[#13110E] border border-[#24211A] px-2.5 py-1 rounded-lg">
                                                  <span>{activeConfig.moe}</span>
                                                  <span className="text-zinc-600">%</span>
                                              </div>
                                          </div>
                                          <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={activeConfig.moe}
                                              onChange={(e) => updateActiveValue('moe', Number(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer block"
                                          />
                                      </div>

                                      <div className="flex justify-between items-center border-t border-zinc-900 pt-3 text-xs font-mono">
                                          <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-display font-medium">TOTAL</span>
                                          <span className={`text-xs font-mono font-medium rounded-md tracking-wide ${totalAllocation === 100 ? 'text-[#10B981]' : 'text-rose-400'}`}>
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
                                              value={activeConfig.rebalancing}
                                              onChange={(e) => updateActiveValue('rebalancing', e.target.value)}
                                              className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-xs text-zinc-200 focus:outline-none focus:border-[#D4962A]/60 font-mono appearance-none tracking-wide cursor-pointer"
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
                                              value={activeConfig.aiModel}
                                              onChange={(e) => updateActiveValue('aiModel', e.target.value)}
                                              className="w-full bg-[#0B0A08] border border-[#24211A] rounded-xl px-4 py-3 text-xs text-zinc-200 focus:outline-none focus:border-[#D4962A]/60 font-mono appearance-none tracking-wide cursor-pointer"
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
                                          onClick={() => updateActiveValue('riskTolerance', 'Conservative')}
                                          className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${activeConfig.riskTolerance === "Conservative"
                                              ? "border-[#10B981] text-[#10B981] bg-[#10B981]/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                              : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                              }`}
                                      >
                                          <span className={`w-1.5 h-1.5 rounded-full transition-all ${activeConfig.riskTolerance === "Conservative" ? "bg-[#10B981] shadow-[0_0_8px_#10B981]" : "bg-zinc-600"
                                              }`} />
                                          Conservative
                                      </button>

                                      <button
                                          type="button"
                                          onClick={() => updateActiveValue('riskTolerance', 'Balanced')}
                                          className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${activeConfig.riskTolerance === "Balanced"
                                              ? "border-[#F59E0B] text-[#F59E0B] bg-[#F59E0B]/10 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                                              : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                              }`}
                                      >
                                          <span className={`w-1.5 h-1.5 rounded-full transition-all ${activeConfig.riskTolerance === "Balanced" ? "bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]" : "bg-zinc-600"
                                              }`} />
                                          Balanced
                                      </button>

                                      <button
                                          type="button"
                                          onClick={() => updateActiveValue('riskTolerance', 'Aggressive')}
                                          className={`py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider rounded-full transition-all flex items-center justify-center gap-2 border ${activeConfig.riskTolerance === "Aggressive"
                                              ? "border-[#EF4444] text-[#EF4444] bg-[#EF4444]/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                              : "border-[#24211A] text-zinc-500 bg-transparent hover:text-zinc-300"
                                              }`}
                                      >
                                          <span className={`w-1.5 h-1.5 rounded-full transition-all ${activeConfig.riskTolerance === "Aggressive" ? "bg-[#EF4444] shadow-[0_0_8px_#EF4444]" : "bg-zinc-600"
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
                                      onClick={() => {
                                        setConfigs(prev => ({
                                          ...prev,
                                          custom: {
                                            ...prev.custom,
                                            usdy: 45,
                                            meth: 35,
                                            moe: 20,
                                            riskTolerance: "Balanced"
                                          }
                                        }));
                                        toast.info("Applied optimized AI allocation to Custom configuration.");
                                      }}
                                      className="text-[#D4962A] hover:text-[#D4962A]/80 transition-colors text-xs font-semibold tracking-wider uppercase ml-2"
                                  >
                                      Generate
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* RIGHT COLUMN: Strategy Templates Sidebar Grid */}
                      <div className="lg:col-span-5 space-y-4">
                          <div className="flex justify-between items-center border-b border-zinc-900/80 pb-4">
                              <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                  STRATEGY TEMPLATES
                              </h2>
                              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-medium">4 PRESETS</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Presets iteration */}
                              {(['conservative', 'balanced', 'aggressive'] as Array<keyof typeof DEFAULT_PRESETS>).map((presetKey) => {
                                  const preset = DEFAULT_PRESETS[presetKey];
                                  return (
                                      <div
                                          key={presetKey}
                                          onClick={() => handleUsePreset(presetKey)}
                                          className="bg-[#13110E] border border-[#24211A] rounded-2xl p-5 hover:border-[#D4962A]/40 transition-all cursor-pointer flex flex-col justify-between h-[210px] group shadow-sm"
                                      >
                                          <div className="space-y-2">
                                              <h3 className="text-base font-normal text-white font-display group-hover:text-[#D4962A] transition-colors tracking-wide">
                                                  {preset.name}
                                              </h3>
                                              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                                  {preset.usdy}% USDY · {preset.meth}% mETH
                                              </p>
                                          </div>

                                          <div className="space-y-4 pt-4 border-t border-zinc-900/50">
                                              <div className="flex justify-between items-end">
                                                  <div>
                                                      <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">EST APY</span>
                                                      <span className="text-2xl font-semibold font-mono text-[#D4962A] tracking-tight leading-none">
                                                          {(preset.usdy * 0.072 + preset.meth * 0.095).toFixed(1)}%
                                                      </span>
                                                  </div>
                                                  <span className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 border rounded-lg font-medium ${
                                                    presetKey === 'conservative' 
                                                      ? 'border-emerald-500/20 text-[#10B981] bg-emerald-500/5' 
                                                      : presetKey === 'balanced'
                                                      ? 'border-amber-500/20 text-[#F59E0B] bg-amber-500/5'
                                                      : 'border-rose-500/20 text-[#EF4444] bg-[#EF4444]/5'
                                                  }`}>
                                                      {preset.riskTolerance}
                                                  </span>
                                              </div>
                                              <button className="w-full text-xs bg-[#D4962A] text-[#150F07] font-bold tracking-wider uppercase py-2.5 rounded-xl hover:bg-[#D4962A]/90 transition-colors shadow-sm">
                                                  Use Template
                                              </button>
                                          </div>
                                      </div>
                                  );
                              })}

                              {/* Custom Preset Card */}
                              <div
                                  onClick={() => handleUsePreset('custom')}
                                  className="bg-[#13110E] border border-dashed border-[#24211A] rounded-2xl p-5 hover:border-[#D4962A]/40 transition-all cursor-pointer flex flex-col justify-between h-[210px] group shadow-sm"
                              >
                                  <div className="space-y-2">
                                      <h3 className="text-base font-normal text-white font-display group-hover:text-[#D4962A] transition-colors tracking-wide">Custom</h3>
                                      <p className="text-xs text-zinc-500 leading-relaxed font-sans">User-defined custom architecture parameters.</p>
                                  </div>
                                  <div className="space-y-4 pt-4 border-t border-zinc-900/50">
                                      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-medium">Calculated User-defined</div>
                                      <button className="w-full text-xs font-bold tracking-wider uppercase border border-[#24211A] text-zinc-200 py-2.5 rounded-xl bg-[#0B0A08] group-hover:border-[#D4962A]/40 group-hover:text-white transition-all shadow-sm">
                                          Build Custom
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                ) : (
                  /* VIEW 2: Detailed Prompt Architect Dashboard */
                  <div className="space-y-6 mb-16">
                      
                      {/* Top Action Subheader Bar */}
                      <div className="flex justify-between items-center bg-[#13110E] border border-[#24211A] rounded-xl px-5 py-3">
                        <button 
                          onClick={() => {
                            setActiveView('presets');
                            setShowSimResults(false);
                          }}
                          className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 hover:text-white uppercase transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
                        </button>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={handleResetToDefault}
                            className="text-[9px] font-mono border border-[#24211A] text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-[#0B0A08] transition-colors"
                          >
                            Reset Defaults
                          </button>
                        </div>
                      </div>

                      {/* Main Columns Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                          
                          {/* LEFT SIDE (Span 7) - Prompt & Guardrails */}
                          <div className="lg:col-span-7 space-y-6">
                              
                              {/* SYSTEM PROMPT ARCHITECT */}
                              <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-4 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                                      <div className="flex items-center gap-2">
                                          <Sparkles className="w-4 h-4 text-[#D4962A]" />
                                          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                              SYSTEM PROMPT ARCHITECT
                                          </h3>
                                      </div>
                                      <span className="text-[9px] font-mono text-zinc-500 border border-[#24211A] px-2 py-0.5 rounded bg-[#0B0A08]">
                                          Core Engine
                                      </span>
                                  </div>

                                  {/* Code Text Editor Frame */}
                                  <div className="flex bg-[#0B0A08] border border-[#24211A] rounded-xl overflow-hidden min-h-[380px] shadow-inner">
                                      {/* Gutter Line Numbers */}
                                      <div className="bg-[#0e0d0b] border-r border-[#24211A] py-4 px-3 text-right select-none font-mono text-xs text-zinc-600 space-y-[4px]">
                                          {lineNumbers.map((num) => (
                                              <div key={num} className="h-5 leading-5 w-5">{num}</div>
                                          ))}
                                      </div>
                                      {/* Text Editor Area */}
                                      <textarea
                                          value={activeConfig.promptText}
                                          onChange={(e) => updateActiveValue('promptText', e.target.value)}
                                          className="flex-1 bg-transparent text-[#D4962A] font-mono text-xs p-4 focus:outline-none resize-none leading-5 tracking-wide h-full min-h-[380px]"
                                          style={{ lineHeight: '1.25rem' }} 
                                          spellCheck="false"
                                      />
                                  </div>

                                  {/* Prompt Editor Status Footer */}
                                  <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-zinc-500">
                                      <div>
                                          Characters: <span className="text-zinc-300">{activeConfig.promptText.length}</span>
                                          <span className="mx-2">|</span>
                                          Tokens: <span className="text-zinc-300">~{Math.ceil(activeConfig.promptText.length / 4)}</span>
                                      </div>
                                      
                                      <button
                                          onClick={handleRevertPrompt}
                                          disabled={activeConfig.promptText === savedConfigs[activePreset].promptText}
                                          className={`flex items-center gap-1.5 uppercase transition-all px-2.5 py-1 rounded-md border ${
                                            activeConfig.promptText !== savedConfigs[activePreset].promptText
                                              ? "text-white border-[#D4962A]/40 bg-[#D4962A]/10 hover:bg-[#D4962A]/20 cursor-pointer"
                                              : "text-zinc-600 border-zinc-900 bg-transparent cursor-not-allowed"
                                          }`}
                                      >
                                          <Undo2 className="w-3 h-3" /> Revert to Previous
                                      </button>
                                  </div>
                              </div>

                              {/* HARD VETO GUARDRAILS */}
                              <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-6 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                                      <div className="flex items-center gap-2">
                                          <ShieldAlert className="w-4 h-4 text-rose-500" />
                                          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                              HARD VETO GUARDRAILS
                                          </h3>
                                      </div>
                                      <span className="flex items-center gap-1.5 text-[9px] font-mono tracking-widest text-[#10B981] bg-[#10B981]/10 px-2.5 py-0.5 rounded-full uppercase">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" /> Active
                                      </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      {/* Slippage tolerance slider */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs text-zinc-300">Slippage Tolerance</span>
                                              <span className="text-xs text-white font-mono bg-[#0B0A08] px-2 py-0.5 rounded border border-[#24211A]">
                                                  {activeConfig.maxSlippage.toFixed(1)}%
                                              </span>
                                          </div>
                                          <input 
                                              type="range"
                                              min="0.1"
                                              max="5.0"
                                              step="0.1"
                                              value={activeConfig.maxSlippage}
                                              onChange={(e) => updateActiveValue('maxSlippage', parseFloat(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                          />
                                          <p className="text-[9px] text-zinc-500 leading-normal">Maximum price slippage permitted before transactions are vetoed.</p>
                                      </div>

                                      {/* Daily gas cap slider */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs text-zinc-300">Daily Gas Limit</span>
                                              <span className="text-xs text-white font-mono bg-[#0B0A08] px-2 py-0.5 rounded border border-[#24211A]">
                                                  {activeConfig.dailyGasCap.toFixed(2)} ETH
                                              </span>
                                          </div>
                                          <input 
                                              type="range"
                                              min="0.01"
                                              max="1.50"
                                              step="0.01"
                                              value={activeConfig.dailyGasCap}
                                              onChange={(e) => updateActiveValue('dailyGasCap', parseFloat(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                          />
                                          <p className="text-[9px] text-zinc-500 leading-normal">Maximum aggregate transaction gas fees allowed per 24 hours.</p>
                                      </div>

                                      {/* Liquidity threshold slider */}
                                      <div className="space-y-2 md:col-span-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs text-zinc-300">Min Pool Liquidity Veto</span>
                                              <span className="text-xs text-white font-mono bg-[#0B0A08] px-2 py-0.5 rounded border border-[#24211A]">
                                                  {formatLiquidity(activeConfig.minPoolLiquidity)}
                                              </span>
                                          </div>
                                          <input 
                                              type="range"
                                              min="100000"
                                              max="10000000"
                                              step="100000"
                                              value={activeConfig.minPoolLiquidity}
                                              onChange={(e) => updateActiveValue('minPoolLiquidity', Number(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[2px] bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                          />
                                          <p className="text-[9px] text-zinc-500 leading-normal">Veto deployment in any liquidity pool with total volume lower than this threshold.</p>
                                      </div>
                                  </div>

                                  {/* Toggle Controls */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-900/60">
                                      <div 
                                          onClick={() => updateActiveValue('volatilityVeto', !activeConfig.volatilityVeto)}
                                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                            activeConfig.volatilityVeto 
                                              ? 'border-[#D4962A]/35 bg-[#D4962A]/5' 
                                              : 'border-[#24211A] bg-[#0C0B09] hover:border-zinc-800'
                                          }`}
                                      >
                                          <div>
                                              <span className="block text-xs font-semibold text-zinc-200">Volatility Veto Protocol</span>
                                              <span className="text-[9px] text-zinc-500 mt-0.5 block">Freeze rebalancing during fast market events.</span>
                                          </div>
                                          <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${activeConfig.volatilityVeto ? 'bg-[#D4962A]' : 'bg-zinc-800'}`}>
                                              <div className={`w-3 h-3 rounded-full bg-[#150F07] transition-transform ${activeConfig.volatilityVeto ? 'translate-x-4' : 'translate-x-0'}`} />
                                          </div>
                                      </div>

                                      <div 
                                          onClick={() => updateActiveValue('unverifiedContractBlock', !activeConfig.unverifiedContractBlock)}
                                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                            activeConfig.unverifiedContractBlock 
                                              ? 'border-[#D4962A]/35 bg-[#D4962A]/5' 
                                              : 'border-[#24211A] bg-[#0C0B09] hover:border-zinc-800'
                                          }`}
                                      >
                                          <div>
                                              <span className="block text-xs font-semibold text-zinc-200">Unverified Pool Block</span>
                                              <span className="text-[9px] text-zinc-500 mt-0.5 block">Restrict interaction to source-verified code.</span>
                                          </div>
                                          <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${activeConfig.unverifiedContractBlock ? 'bg-[#D4962A]' : 'bg-zinc-800'}`}>
                                              <div className={`w-3 h-3 rounded-full bg-[#150F07] transition-transform ${activeConfig.unverifiedContractBlock ? 'translate-x-4' : 'translate-x-0'}`} />
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {/* RIGHT SIDE (Span 5) - Weights & Data Sources */}
                          <div className="lg:col-span-5 space-y-6">
                              
                              {/* STRATEGIC WEIGHTS */}
                              <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-6 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                                      <div className="flex items-center gap-2">
                                          <Sliders className="w-4 h-4 text-[#D4962A]" />
                                          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                              STRATEGIC WEIGHTS
                                          </h3>
                                      </div>
                                  </div>

                                  <div className="space-y-6">
                                      {/* LLM Sentiment influence */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">LLM Sentiment Influence</span>
                                              <span className="text-xs text-[#D4962A] font-mono font-semibold">
                                                  {activeConfig.llmSentiment}%
                                              </span>
                                          </div>
                                          <input 
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={activeConfig.llmSentiment}
                                              onChange={(e) => updateActiveValue('llmSentiment', Number(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[3px] bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                          />
                                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                                              Weight given to unstructured data analysis (news, governance proposals) vs quantitative market metrics.
                                          </p>
                                      </div>

                                      {/* Kelly Aggressiveness */}
                                      <div className="space-y-2">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">Kelly Aggressiveness</span>
                                              <span className="text-xs text-[#D4962A] font-mono font-semibold">
                                                  {activeConfig.kellyAggressiveness.toFixed(2)} <span className="text-[10px] text-zinc-500 font-normal">(Fractional)</span>
                                              </span>
                                          </div>
                                          <input 
                                              type="range"
                                              min="0.05"
                                              max="1.00"
                                              step="0.05"
                                              value={activeConfig.kellyAggressiveness}
                                              onChange={(e) => updateActiveValue('kellyAggressiveness', parseFloat(e.target.value))}
                                              className="w-full accent-[#D4962A] h-[3px] bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                          />
                                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                                              Multiplier for optimal bet sizing. Lower values represent more conservative capital deployment.
                                          </p>
                                      </div>

                                      {/* Risk Engine Sensitivity */}
                                      <div className="space-y-3 pt-2">
                                          <span className="block text-xs font-mono uppercase tracking-wider text-zinc-300">Risk Engine Sensitivity</span>
                                          <div className="grid grid-cols-3 gap-2 bg-[#0B0A08] p-1 border border-[#24211A] rounded-xl">
                                              {(['Low', 'Medium', 'High'] as Array<StrategyConfig['riskSensitivity']>).map((lvl) => {
                                                  const isSel = activeConfig.riskSensitivity === lvl;
                                                  return (
                                                      <button
                                                          key={lvl}
                                                          type="button"
                                                          onClick={() => updateActiveValue('riskSensitivity', lvl)}
                                                          className={`py-1.5 text-[9px] font-mono uppercase tracking-wider rounded-lg transition-all border ${
                                                              isSel 
                                                              ? "bg-[#D4962A]/10 border-[#D4962A]/40 text-[#D4962A] font-bold"
                                                              : "border-transparent text-zinc-500 bg-transparent hover:text-zinc-300"
                                                          }`}
                                                      >
                                                          {lvl}
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                                              Threshold for interpreting volatility spikes as systemic risk vs temporary noise.
                                          </p>
                                      </div>
                                  </div>
                              </div>

                              {/* ACTIVE DATA SOURCES */}
                              <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-6 space-y-4 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                                      <div className="flex items-center gap-2">
                                          <Database className="w-4 h-4 text-[#D4962A]" />
                                          <h3 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase font-display">
                                              ACTIVE DATA SOURCES
                                          </h3>
                                      </div>
                                  </div>

                                  <div className="space-y-3">
                                      {/* Source 1: Pyth */}
                                      <div 
                                          onClick={() => updateActiveValue('pythOracles', !activeConfig.pythOracles)}
                                          className="flex items-center justify-between p-3 border border-[#24211A] bg-[#0C0B09] rounded-xl hover:border-zinc-800 transition-all cursor-pointer"
                                      >
                                          <div className="flex items-center gap-3">
                                              <Network className="w-4 h-4 text-[#D4962A]/80" />
                                              <div>
                                                  <span className="block text-xs font-semibold text-zinc-200">Pyth Network Oracles</span>
                                                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Sub-second Price Feeds</span>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              {activeConfig.pythOracles ? (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#D4962A]">ACTIVE</span>
                                                      <span className="w-2 h-2 rounded-full bg-[#D4962A] shadow-[0_0_8px_#D4962A] animate-pulse" />
                                                  </>
                                              ) : (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">MUTED</span>
                                                      <span className="w-2 h-2 rounded-full bg-zinc-700" />
                                                  </>
                                              )}
                                          </div>
                                      </div>

                                      {/* Source 2: Gov Forum */}
                                      <div 
                                          onClick={() => updateActiveValue('govForumScraper', !activeConfig.govForumScraper)}
                                          className="flex items-center justify-between p-3 border border-[#24211A] bg-[#0C0B09] rounded-xl hover:border-zinc-800 transition-all cursor-pointer"
                                      >
                                          <div className="flex items-center gap-3">
                                              <Database className="w-4 h-4 text-[#D4962A]/80" />
                                              <div>
                                                  <span className="block text-xs font-semibold text-zinc-200">Governance Forum Scraper</span>
                                                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Proposal Text Sentiment</span>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              {activeConfig.govForumScraper ? (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#D4962A]">ACTIVE</span>
                                                      <span className="w-2 h-2 rounded-full bg-[#D4962A] shadow-[0_0_8px_#D4962A] animate-pulse" />
                                                  </>
                                              ) : (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">MUTED</span>
                                                      <span className="w-2 h-2 rounded-full bg-zinc-700" />
                                                  </>
                                              )}
                                          </div>
                                      </div>

                                      {/* Source 3: Social Sentiment */}
                                      <div 
                                          onClick={() => updateActiveValue('socialSentiment', !activeConfig.socialSentiment)}
                                          className="flex items-center justify-between p-3 border border-[#24211A] bg-[#0C0B09] rounded-xl hover:border-zinc-800 transition-all cursor-pointer"
                                      >
                                          <div className="flex items-center gap-3">
                                              <Activity className="w-4 h-4 text-[#D4962A]/80" />
                                              <div>
                                                  <span className="block text-xs font-semibold text-zinc-200">Social Sentiment Index</span>
                                                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">X & Discord NLP Streams</span>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              {activeConfig.socialSentiment ? (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#D4962A]">ACTIVE</span>
                                                      <span className="w-2 h-2 rounded-full bg-[#D4962A] shadow-[0_0_8px_#D4962A] animate-pulse" />
                                                  </>
                                              ) : (
                                                  <>
                                                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">MUTED</span>
                                                      <span className="w-2 h-2 rounded-full bg-zinc-700" />
                                                  </>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Simulation Progress Display */}
                      {isSimulating && (
                        <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 py-10 shadow-lg animate-pulse">
                          <Loader2 className="w-8 h-8 text-[#D4962A] animate-spin" />
                          <div className="text-center">
                            <h4 className="text-sm font-semibold text-white">Yield Engine Simulator Running</h4>
                            <p className="text-xs text-zinc-500 font-mono mt-1">{simulationSteps[simStep]}</p>
                          </div>
                          <div className="w-64 bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#D4962A] h-full transition-all duration-500" 
                              style={{ width: `${((simStep + 1) / simulationSteps.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Simulation Results Display (Line Graph using Recharts) */}
                      {showSimResults && !isSimulating && (
                        <div className="bg-[#13110E] border border-[#D4962A]/40 rounded-2xl p-6 space-y-6 shadow-lg relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4962A]/5 rounded-full filter blur-3xl pointer-events-none" />
                          <div className="flex justify-between items-start border-b border-zinc-900 pb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <ChartIcon className="w-4 h-4 text-[#D4962A]" />
                                <h4 className="text-sm font-semibold uppercase text-white tracking-wider">SIMULATION ANALYSIS RESULTS</h4>
                              </div>
                              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                                Backtest parameters: Volatility Stress (45%) | Gas Cost Multiplier (1.5x)
                              </p>
                            </div>
                            <button 
                              onClick={() => setShowSimResults(false)}
                              className="text-[9px] font-mono border border-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 rounded bg-[#0B0A08] transition-colors"
                            >
                              Dismiss Results
                            </button>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                            {/* Stats */}
                            <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                              <div className="bg-[#0B0A08] border border-[#24211A] rounded-xl p-4">
                                <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">PROPORTIONAL APY</span>
                                <span className="text-3xl font-semibold font-mono text-[#D4962A]">{dynamicApy.toFixed(2)}%</span>
                              </div>
                              <div className="bg-[#0B0A08] border border-[#24211A] rounded-xl p-4">
                                <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">SHARPE RATIO</span>
                                <span className="text-3xl font-semibold font-mono text-emerald-400">{dynamicSharpe.toFixed(2)}</span>
                              </div>
                              <div className="bg-[#0B0A08] border border-[#24211A] rounded-xl p-4 col-span-2">
                                <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">EXECUTION EFFICIENCY</span>
                                <span className="text-base font-semibold font-mono text-white">99.4% <span className="text-xs text-zinc-500 font-normal">(Ultra-Low slippage)</span></span>
                              </div>
                            </div>

                            {/* Chart block */}
                            <div className="lg:col-span-8 bg-[#0B0A08] border border-[#24211A] rounded-xl p-4 h-64">
                              <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-4">6-Month Capital Growth Projection (USD)</span>
                              <div className="w-full h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={generateChartData()} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <defs>
                                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#D4962A" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#D4962A" stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1b18" />
                                    <XAxis dataKey="month" stroke="#71717a" fontSize={9} fontClassName="font-mono" />
                                    <YAxis stroke="#71717a" fontSize={9} fontClassName="font-mono" domain={['dataMin - 100', 'dataMax + 100']} />
                                    <Tooltip 
                                      contentStyle={{ backgroundColor: "#13110E", borderColor: "#24211A", borderRadius: 8 }}
                                      labelStyle={{ color: "#71717a", fontSize: 10 }}
                                      itemStyle={{ color: "#D4962A", fontSize: 11 }}
                                    />
                                    <Area type="monotone" dataKey="balance" stroke="#D4962A" fillOpacity={1} fill="url(#colorBalance)" strokeWidth={2} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottom Status & Execution Banner */}
                      <div className="bg-[#13110E] border border-[#24211A] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-md">
                          
                          {/* Alert Banner / Synchronized message */}
                          <div className="flex items-center gap-3">
                              {isModified ? (
                                  <>
                                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                          <AlertTriangle className="w-4 h-4 animate-bounce" />
                                      </div>
                                      <div>
                                          <h4 className="text-xs font-semibold text-white font-mono uppercase tracking-wider">Strategy Modified</h4>
                                          <p className="text-[10px] text-zinc-400 mt-0.5">Unsaved modifications in system prompt / parameters.</p>
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#10B981]">
                                          <Check className="w-4 h-4" />
                                      </div>
                                      <div>
                                          <h4 className="text-xs font-semibold text-white font-mono uppercase tracking-wider">Strategy Synchronized</h4>
                                          <p className="text-[10px] text-zinc-400 mt-0.5">Prompt architecture and parameters fully configured.</p>
                                      </div>
                                  </>
                              )}
                          </div>

                          {/* Controls buttons row */}
                          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                              {isModified && (
                                <button
                                    onClick={handleRevertAll}
                                    className="px-4 py-2.5 text-xs text-zinc-400 hover:text-white uppercase font-mono tracking-wider transition-colors border border-transparent hover:border-zinc-800 rounded-xl bg-transparent"
                                >
                                    Revert All
                                </button>
                              )}
                              
                              <button
                                  onClick={() => setIsSimulating(true)}
                                  disabled={isSimulating}
                                  className="px-5 py-2.5 text-xs font-semibold text-zinc-200 border border-[#24211A] rounded-xl hover:border-zinc-700 bg-[#0B0A08] transition-all flex items-center gap-2 uppercase tracking-wider shadow-sm disabled:opacity-50"
                              >
                                  <Sliders className="w-3.5 h-3.5" /> Simulate Changes
                              </button>

                              <button
                                  onClick={handleSave}
                                  disabled={!isModified}
                                  className={`px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-sm ${
                                    isModified 
                                      ? "bg-[#D4962A] text-[#150F07] hover:bg-[#D4962A]/90 hover:scale-[1.01] cursor-pointer" 
                                      : "bg-zinc-800 text-zinc-500 border border-zinc-900 cursor-not-allowed"
                                  }`}
                              >
                                  <Check className="w-3.5 h-3.5" /> Save Strategy
                              </button>
                          </div>
                      </div>
                  </div>
                )}
            </div>
        </div>
    );
}