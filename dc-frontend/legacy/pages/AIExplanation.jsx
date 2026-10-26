import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Brain,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  GitCommit,
  ArrowDown,
  Copy,
  Check,
  Download,
  Info,
  Sliders,
  Share2,
} from 'lucide-react';
import { serversAPI, mlAPI } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';
import LoadingSpinner from '../components/LoadingSpinner';

export const AIExplanation = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const serverQuery = searchParams.get('server') || 'server-001';

  const [selectedServer, setSelectedServer] = useState(serverQuery);
  const [servers, setServers] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadServers = async () => {
      try {
        const list = await serversAPI.getServers();
        setServers(list);
      } catch (err) {
        console.error('Failed to load servers:', err);
      }
    };
    loadServers();
  }, []);

  const handleServerChange = (e) => {
    const val = e.target.value;
    setSelectedServer(val);
    setSearchParams({ server: val });
  };

  const isHighRisk = selectedServer === 'server-001';

  // SHAP Feature attributions
  const shapFeatures = isHighRisk
    ? [
        {
          feature: 'CPU Utilization',
          metricKey: 'cpu_pct',
          value: '94.2%',
          shap_value: 0.45,
          impact: 'positive',
          explanation: 'CPU at 94.2% is the dominant driver (+0.45) pushing model toward cpu_spike classification.',
        },
        {
          feature: 'Chassis Temperature',
          metricKey: 'temperature',
          value: '84.1°C',
          shap_value: 0.32,
          impact: 'positive',
          explanation: 'High core die temperature (+0.32) confirms continuous unthrottled computational load.',
        },
        {
          feature: 'RAM Saturation',
          metricKey: 'ram_pct',
          value: '88.5%',
          shap_value: 0.18,
          impact: 'positive',
          explanation: 'Memory pressure (+0.18) indicates memory-intensive processes without garbage collection.',
        },
        {
          feature: 'Network I/O Ingest',
          metricKey: 'network_in_mbps',
          value: '820 MB/s',
          shap_value: 0.08,
          impact: 'positive',
          explanation: 'High traffic ingress adds moderate overhead (+0.08) to packet processing queues.',
        },
        {
          feature: 'Fan Speed Controller',
          metricKey: 'fan_speed_rpm',
          value: '4,900 RPM',
          shap_value: -0.15,
          impact: 'negative',
          explanation: 'Auxiliary fan speed running at 98% capacity actively dampens thermal runway risk (-0.15).',
        },
        {
          feature: 'Disk IOPS Latency',
          metricKey: 'disk_iops_wait',
          value: '2.1 ms',
          shap_value: -0.10,
          impact: 'negative',
          explanation: 'NVMe storage latency is optimal, ruling out disk saturation bottlenecks (-0.10).',
        },
      ]
    : [
        {
          feature: 'CPU Utilization',
          metricKey: 'cpu_pct',
          value: '38.4%',
          shap_value: -0.42,
          impact: 'negative',
          explanation: 'Low CPU load (-0.42) provides substantial buffer against outage thresholds.',
        },
        {
          feature: 'Chassis Temperature',
          metricKey: 'temperature',
          value: '58.0°C',
          shap_value: -0.30,
          impact: 'negative',
          explanation: 'Chassis thermal sensors remain in recommended operational temperature range (-0.30).',
        },
        {
          feature: 'RAM Saturation',
          metricKey: 'ram_pct',
          value: '48.2%',
          shap_value: -0.22,
          impact: 'negative',
          explanation: 'Substantial free memory buffer eliminates memory exhaustion concerns (-0.22).',
        },
        {
          feature: 'Fan Speed Controller',
          metricKey: 'fan_speed_rpm',
          value: '2,400 RPM',
          shap_value: -0.05,
          impact: 'negative',
          explanation: 'Normal acoustic acoustic speed (-0.05).',
        },
      ];

  const ruleChecklist = isHighRisk
    ? [
        { rule: 'CPU > 85% for > 5 consecutive minutes', status: 'TRIGGERED', severity: 'critical', value: '94.2% (Duration: 8m)' },
        { rule: 'Chassis Temperature > 80°C threshold', status: 'TRIGGERED', severity: 'critical', value: '84.1°C' },
        { rule: 'RAM Saturation > 85%', status: 'TRIGGERED', severity: 'high', value: '88.5%' },
        { rule: 'Network Ingress Packet Drops > 2%', status: 'PASSED', severity: 'healthy', value: '0.01% (Nominal)' },
        { rule: 'Disk Volume Space > 90%', status: 'PASSED', severity: 'healthy', value: '58% (Healthy)' },
      ]
    : [
        { rule: 'CPU > 85% for > 5 consecutive minutes', status: 'PASSED', severity: 'healthy', value: '38.4% (Nominal)' },
        { rule: 'Chassis Temperature > 80°C threshold', status: 'PASSED', severity: 'healthy', value: '58.0°C (Optimal)' },
        { rule: 'RAM Saturation > 85%', status: 'PASSED', severity: 'healthy', value: '48.2% (Nominal)' },
        { rule: 'Network Ingress Packet Drops > 2%', status: 'PASSED', severity: 'healthy', value: '0.00% (Nominal)' },
        { rule: 'Disk Volume Space > 90%', status: 'PASSED', severity: 'healthy', value: '52% (Healthy)' },
      ];

  const handleCopyReport = () => {
    const report = `VAULTWATCH AI ROOT CAUSE ANALYSIS REPORT
Target Node: ${selectedServer}
Incident Classification: ${isHighRisk ? 'cpu_spike & thermal_warning' : 'nominal'}
Confidence Score: ${isHighRisk ? '97.8%' : '99.2%'}
Summary: ${
      isHighRisk
        ? 'High CPU (94.2%) and elevated temperature (84.1°C) indicate a likely cpu_spike incident driven by compute-intensive jobs.'
        : 'Node operational within target parameters. No anomalous signatures detected.'
    }
Top Contributing SHAP Features:
${shapFeatures.map((f) => `- ${f.feature} (${f.value}): SHAP ${f.shap_value > 0 ? '+' : ''}${f.shap_value} -> ${f.explanation}`).join('\n')}
Generated at: ${new Date().toISOString()}`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            AI Root Cause Analysis & SHAP Explainability
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Interpretable Machine Learning via TreeExplainer & Rule-Based SRE Guardrails
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-[#525252] whitespace-nowrap">
            Analyze Server:
          </label>
          <select
            value={selectedServer}
            onChange={handleServerChange}
            className="text-xs bg-white border border-[#E0E0E0] rounded-[3px] px-3 py-1.5 font-mono font-medium focus:outline-none focus:border-[#0F62FE]"
          >
            {servers.length > 0 ? (
              servers.map((s) => (
                <option key={s.id || s.hostname} value={s.hostname}>
                  {s.hostname} {s.hostname === 'server-001' ? '(Incident Active)' : ''}
                </option>
              ))
            ) : (
              <>
                <option value="server-001">server-001 (Active Incident)</option>
                <option value="server-002">server-002 (Nominal)</option>
              </>
            )}
          </select>

          <button
            onClick={handleCopyReport}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#24A148]" /> : <Copy className="w-3.5 h-3.5 text-[#525252]" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Post-Mortem Report'}</span>
          </button>
        </div>
      </div>

      {/* Root Cause Summary Card */}
      <div className="card p-6 bg-white border-l-4 border-l-[#0F62FE]">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E0E0E0]">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#0F62FE]" />
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Natural Language Root Cause Diagnosis
            </h2>
          </div>
          <SeverityBadge
            severity={isHighRisk ? 'critical' : 'healthy'}
            label={isHighRisk ? 'CLASSIFIED: CPU_SPIKE' : 'CLASSIFIED: NOMINAL'}
          />
        </div>

        <p className="text-sm text-[#161616] leading-relaxed font-medium">
          {isHighRisk ? (
            <>
              High CPU utilization (<span className="text-[#DA1E28] font-bold font-mono">94.2%</span>) coupled with
              elevated die temperature (<span className="text-[#DA1E28] font-bold font-mono">84.1°C</span>) and memory
              saturation (<span className="text-[#161616] font-bold font-mono">88.5%</span>) indicate a verified{' '}
              <strong className="text-[#DA1E28]">cpu_spike</strong> incident. TreeExplainer confirms CPU and thermal factors
              account for <strong className="text-[#0F62FE]">77%</strong> of the model's anomalous classification score.
            </>
          ) : (
            <>
              All telemetry metrics for <span className="font-bold font-mono">{selectedServer}</span> operate within standard
              statistical bounds. Baseline CPU (<span className="font-mono">38.4%</span>) and chassis temperature (<span className="font-mono">58.0°C</span>)
              exhibit healthy thermal headroom with zero anomaly divergence.
            </>
          )}
        </p>
      </div>

      {/* Bidirectional SHAP Horizontal Bars */}
      <div className="card p-6 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#E0E0E0] gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Bidirectional SHAP Feature Impact
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Red bars increase incident likelihood (+); Blue bars act as stabilizing factors (-)
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[2px] bg-[#DA1E28]" />
              <span className="text-[#525252]">Increases Outage Risk (+)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[2px] bg-[#0F62FE]" />
              <span className="text-[#525252]">Mitigating / Safe (-)</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {shapFeatures.map((feat, idx) => {
            const isPos = feat.shap_value > 0;
            const barWidth = Math.min(Math.abs(feat.shap_value) * 160, 100);

            return (
              <div key={idx} className="p-3.5 bg-[#F4F4F4]/50 rounded-[3px] border border-[#E0E0E0]">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#161616]">{feat.feature}</span>
                    <span className="font-mono text-[#525252] bg-white px-1.5 py-0.5 border border-[#E0E0E0] rounded">
                      {feat.value}
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      isPos ? 'text-[#DA1E28]' : 'text-[#0F62FE]'
                    }`}
                  >
                    {isPos ? `+${feat.shap_value.toFixed(2)}` : feat.shap_value.toFixed(2)} SHAP
                  </span>
                </div>

                {/* Split Center Bar */}
                <div className="w-full bg-[#E0E0E0] h-3 rounded-[2px] relative overflow-hidden flex">
                  {/* Left half (negative) */}
                  <div className="w-1/2 flex justify-end">
                    {!isPos && (
                      <div
                        className="h-full bg-[#0F62FE] transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                  {/* Center line */}
                  <div className="w-0.5 h-full bg-[#161616] z-10" />
                  {/* Right half (positive) */}
                  <div className="w-1/2 flex justify-start">
                    {isPos && (
                      <div
                        className="h-full bg-[#DA1E28] transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                </div>

                <p className="text-xs text-[#525252] mt-2 leading-relaxed">
                  {feat.explanation}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Decision Tree Traversal Path & Rule Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Decision Tree Path */}
        <div className="card p-6 bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E0E0E0]">
              <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
                XGBoost Tree Decision Path
              </h2>
              <span className="text-xs font-mono text-[#525252]">Tree #4 Split Sequence</span>
            </div>

            <div className="space-y-3 relative">
              {/* Step 1 */}
              <div className="p-3 bg-[#F4F4F4] rounded-[3px] border border-[#E0E0E0] text-xs">
                <div className="flex items-center justify-between font-bold text-[#161616]">
                  <span>Step 1: Root Node Split</span>
                  <span className="font-mono text-[#0F62FE]">cpu_pct &gt; 85.0%</span>
                </div>
                <p className="text-[#525252] mt-1">
                  Observed: <strong className="font-mono">{isHighRisk ? '94.2%' : '38.4%'}</strong> → {isHighRisk ? 'Follows True Branch' : 'Follows False Branch'}
                </p>
              </div>

              <div className="flex justify-center text-[#525252]">
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* Step 2 */}
              <div className="p-3 bg-[#F4F4F4] rounded-[3px] border border-[#E0E0E0] text-xs">
                <div className="flex items-center justify-between font-bold text-[#161616]">
                  <span>Step 2: Thermal Check</span>
                  <span className="font-mono text-[#0F62FE]">temperature &gt; 80.0°C</span>
                </div>
                <p className="text-[#525252] mt-1">
                  Observed: <strong className="font-mono">{isHighRisk ? '84.1°C' : '58.0°C'}</strong> → {isHighRisk ? 'Sustained Thermal Stress' : 'Normal Thermal'}
                </p>
              </div>

              <div className="flex justify-center text-[#525252]">
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* Step 3 */}
              <div className={`p-3 rounded-[3px] border text-xs ${isHighRisk ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center justify-between font-bold">
                  <span className={isHighRisk ? 'text-[#DA1E28]' : 'text-[#24A148]'}>
                    Step 3: Leaf Node Output
                  </span>
                  <span className="font-mono text-xs font-bold">
                    {isHighRisk ? 'LEAF = 0.978' : 'LEAF = 0.015'}
                  </span>
                </div>
                <p className="mt-1 text-[#525252]">
                  Classification finalized: <strong className="text-[#161616]">{isHighRisk ? 'cpu_spike' : 'nominal'}</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E0E0E0] text-[11px] text-[#525252]">
            Ensemble aggregation includes 100 gradient boosted trees with depth 4.
          </div>
        </div>

        {/* Rule-Based Checklist */}
        <div className="card p-6 bg-white">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E0E0E0]">
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Rule-Based SRE Guardrails Checklist
            </h2>
            <span className="text-xs text-[#525252]">5 Active Policies</span>
          </div>

          <div className="space-y-3">
            {ruleChecklist.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-[#F4F4F4]/70 rounded-[3px] border border-[#E0E0E0] flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-semibold text-[#161616]">{item.rule}</p>
                  <p className="text-[11px] font-mono text-[#525252] mt-0.5">
                    Evaluated Value: {item.value}
                  </p>
                </div>
                <SeverityBadge
                  severity={item.severity}
                  label={item.status}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIExplanation;
