import React, { useState } from 'react';
import {
  Gauge,
  Activity,
  Zap,
  Layers,
  Cpu,
  CheckCircle,
  Clock,
  TrendingUp,
  Award,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import StatCard from '../components/StatCard';
import SeverityBadge from '../components/SeverityBadge';

const MODEL_RADAR_DATA = [
  { metric: 'Accuracy', XGBoost: 96, BiLSTM: 94, IsoForest: 88, Baseline: 82 },
  { metric: 'Speed / Latency', XGBoost: 98, BiLSTM: 82, IsoForest: 95, Baseline: 90 },
  { metric: 'Explainability', XGBoost: 95, BiLSTM: 88, IsoForest: 70, Baseline: 75 },
  { metric: 'Robustness', XGBoost: 92, BiLSTM: 96, IsoForest: 85, Baseline: 80 },
  { metric: 'Memory Footprint', XGBoost: 90, BiLSTM: 80, IsoForest: 94, Baseline: 85 },
];

const MODEL_COMPARISON_TABLE = [
  {
    name: 'XGBoost Classifier + SHAP',
    task: 'Multivariate Anomaly Classification',
    accuracy: '96.8%',
    f1: '96.2%',
    latency: '8.4 ms',
    explainability: 'SHAP TreeExplainer (Exact)',
    status: 'active',
  },
  {
    name: 'Bi-LSTM with Temporal Attention',
    task: '360-Step Lead Horizon Forecasting',
    accuracy: '94.6%',
    f1: '94.1%',
    latency: '18.2 ms',
    explainability: 'Attention Step Weights',
    status: 'active',
  },
  {
    name: 'Isolation Forest Ensemble',
    task: 'Unsupervised Outlier Scoring',
    accuracy: '91.2%',
    f1: '89.8%',
    latency: '4.6 ms',
    explainability: 'Path Length Attribution',
    status: 'active',
  },
  {
    name: 'Random Forest (Baseline)',
    task: 'Static Threshold Benchmark',
    accuracy: '84.5%',
    f1: '82.0%',
    latency: '11.0 ms',
    explainability: 'Feature Impurity (Gini)',
    status: 'low',
  },
];

// 4x4 Confusion Matrix
const CONFUSION_MATRIX = [
  { actual: 'Nominal', predNominal: 942, predCpu: 12, predMem: 8, predThermal: 4 },
  { actual: 'CPU Spike', predNominal: 8, predCpu: 486, predMem: 6, predThermal: 12 },
  { actual: 'Memory Leak', predNominal: 10, predCpu: 5, predMem: 390, predThermal: 2 },
  { actual: 'Thermal Runaway', predNominal: 4, predCpu: 14, predMem: 3, predThermal: 288 },
];

export const ModelPerformance = () => {
  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
          Model Performance & ML Benchmarks
        </h1>
        <p className="text-xs text-[#525252] mt-0.5">
          Validation metrics, latency profiles, and confusion matrices for the Bi-LSTM & XGBoost pipeline
        </p>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <StatCard
          title="Accuracy"
          value="96.4%"
          icon={Award}
          trend="+1.8% vs v2.3"
          trendDirection="up"
          subtitle="Test set: 2,500 samples"
        />
        <StatCard
          title="Precision"
          value="94.8%"
          icon={CheckCircle}
          trend="Low False Positives"
          trendDirection="up"
          subtitle="Precision score"
        />
        <StatCard
          title="Recall"
          value="95.2%"
          icon={Activity}
          trend="99.1% on Critical"
          trendDirection="up"
          subtitle="True positive rate"
        />
        <StatCard
          title="F1-Score"
          value="95.0%"
          icon={TrendingUp}
          trend="Harmonic Mean"
          trendDirection="up"
          subtitle="Macro-averaged F1"
        />
        <StatCard
          title="Inference Latency"
          value="14.2 ms"
          icon={Zap}
          trend="-6ms optimization"
          trendDirection="down"
          subtitle="End-to-end pipeline"
        />
      </div>

      {/* Models Comparison Table */}
      <div className="card bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E0E0E0]">
          <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
            Architecture Comparison Matrix
          </h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Cross-validation comparison of deployed AI models vs baseline architectures
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Model Architecture</th>
                <th className="py-2.5 px-4">Primary SRE Task</th>
                <th className="py-2.5 px-4">Accuracy</th>
                <th className="py-2.5 px-4">Macro F1</th>
                <th className="py-2.5 px-4">Latency</th>
                <th className="py-2.5 px-4">Interpretability Mechanism</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0] text-xs">
              {MODEL_COMPARISON_TABLE.map((row, idx) => (
                <tr key={idx} className="hover:bg-[#F4F4F4] transition-colors">
                  <td className="py-3 px-4 font-bold text-[#161616]">{row.name}</td>
                  <td className="py-3 px-4 text-[#525252]">{row.task}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-[#161616]">{row.accuracy}</td>
                  <td className="py-3 px-4 font-mono text-[#525252]">{row.f1}</td>
                  <td className="py-3 px-4 font-mono text-[#0F62FE] font-medium">{row.latency}</td>
                  <td className="py-3 px-4 text-[#161616] font-medium">{row.explainability}</td>
                  <td className="py-3 px-4">
                    <SeverityBadge
                      severity={row.status === 'active' ? 'healthy' : 'low'}
                      label={row.status === 'active' ? 'PRODUCTION' : 'BASELINE'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Radar Chart & Confusion Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recharts RadarChart */}
        <div className="card p-6 bg-white flex flex-col justify-between">
          <div className="pb-3 mb-2 border-b border-[#E0E0E0]">
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Multivariate Radar Evaluation
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Comparison across 5 key operational axes (0 - 100 scale)
            </p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={MODEL_RADAR_DATA}>
                <PolarGrid stroke="#E0E0E0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#161616' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#8D8D8D' }} />
                <Radar name="XGBoost" dataKey="XGBoost" stroke="#0F62FE" fill="#0F62FE" fillOpacity={0.25} />
                <Radar name="Bi-LSTM" dataKey="BiLSTM" stroke="#8A3FFC" fill="#8A3FFC" fillOpacity={0.2} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E0E0E0',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="text-xs text-[#525252] pt-2 border-t border-[#F4F4F4] text-center">
            Both XGBoost and Bi-LSTM demonstrate complementary strengths in speed vs long-term horizon robustness.
          </div>
        </div>

        {/* 4x4 Confusion Matrix */}
        <div className="card p-6 bg-white">
          <div className="pb-3 mb-4 border-b border-[#E0E0E0]">
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              4x4 Multi-Class Confusion Matrix
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Evaluation on 2,500 labeled enterprise data center telemetry sequences
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-[10px] text-[#525252] text-left uppercase font-bold">
                    Actual \ Predicted
                  </th>
                  <th className="p-2 text-[10px] font-bold text-[#525252] uppercase">Nominal</th>
                  <th className="p-2 text-[10px] font-bold text-[#525252] uppercase">CPU Spike</th>
                  <th className="p-2 text-[10px] font-bold text-[#525252] uppercase">Memory Leak</th>
                  <th className="p-2 text-[10px] font-bold text-[#525252] uppercase">Thermal</th>
                </tr>
              </thead>
              <tbody>
                {CONFUSION_MATRIX.map((row, idx) => (
                  <tr key={idx} className="border-t border-[#E0E0E0]">
                    <td className="p-2 text-left font-bold text-[#161616] bg-[#F4F4F4]">
                      {row.actual}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        idx === 0
                          ? 'bg-[#DEFBE6] text-[#198038]'
                          : row.predNominal > 0
                          ? 'bg-[#FFF1F1] text-[#DA1E28]'
                          : 'text-[#525252]'
                      }`}
                    >
                      {row.predNominal}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        idx === 1
                          ? 'bg-[#DEFBE6] text-[#198038]'
                          : row.predCpu > 0
                          ? 'bg-[#FFF1F1] text-[#DA1E28]'
                          : 'text-[#525252]'
                      }`}
                    >
                      {row.predCpu}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        idx === 2
                          ? 'bg-[#DEFBE6] text-[#198038]'
                          : row.predMem > 0
                          ? 'bg-[#FFF1F1] text-[#DA1E28]'
                          : 'text-[#525252]'
                      }`}
                    >
                      {row.predMem}
                    </td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        idx === 3
                          ? 'bg-[#DEFBE6] text-[#198038]'
                          : row.predThermal > 0
                          ? 'bg-[#FFF1F1] text-[#DA1E28]'
                          : 'text-[#525252]'
                      }`}
                    >
                      {row.predThermal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#525252] mt-4 pt-3 border-t border-[#E0E0E0]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#DEFBE6] border border-[#A7F0BA] rounded-[2px]" />
              <span>Correct Classifications (Diagonal: 2,106)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#FFF1F1] border border-[#FFD7D9] rounded-[2px]" />
              <span>Misclassifications (Off-diagonal: 63)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelPerformance;
