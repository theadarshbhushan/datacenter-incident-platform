import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ShieldCheck, Zap, Cpu, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import { authAPI } from '../services/api';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@datacenter.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authAPI.login(email, password);
      if (res && (res.access_token || res.token)) {
        const token = res.access_token || res.token;
        localStorage.setItem('dc_token', token);
        localStorage.setItem('token', token);
        localStorage.setItem(
          'dc_user',
          JSON.stringify({
            name: email.split('@')[0].toUpperCase(),
            email,
            role: 'Lead SRE Operator',
          })
        );
        navigate('/dashboard');
      } else {
        setError('Invalid credentials returned from server.');
      }
    } catch (err) {
      console.error('Login error:', err);
      // If server error, offer demo mode fallback or show message
      setError('Unable to authenticate with server. You can use Demo Mode below.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = () => {
    authAPI.loginDemo();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F4F4F4]">
      {/* Left Branding Panel: Enterprise Dark Aesthetic */}
      <div className="md:w-1/2 bg-[#161616] text-white p-8 md:p-14 flex flex-col justify-between relative overflow-hidden">
        {/* Ambient Grid Pattern Overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #FFFFFF 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-[4px] bg-[#0F62FE] text-white flex items-center justify-center shadow-lg">
              <Layers className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">DC-SENTINEL</span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-white/10 text-white font-bold rounded">
              v2.4 LTS
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4 leading-snug">
            Autonomous Data Center Infrastructure Intelligence
          </h1>
          <p className="text-sm text-[#A8A8A8] max-w-md leading-relaxed mb-8">
            Mission-critical operations platform integrating Bi-LSTM temporal attention forecasting,
            XGBoost tree explainability, and real-time Kafka telemetry streams.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-[#0F62FE]/20 text-[#0F62FE] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Bi-LSTM Attention Forecaster</h4>
                <p className="text-xs text-[#8D8D8D]">360-step lead time prediction with temporal weight attribution.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-[#24A148]/20 text-[#24A148] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">SHAP Root Cause Explanations</h4>
                <p className="text-xs text-[#8D8D8D]">Game-theoretic feature importance for every detected anomaly.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-[#F1C21B]/20 text-[#F1C21B] flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Sub-Second Incident Triaging</h4>
                <p className="text-xs text-[#8D8D8D]">Real-time alerting & automated playbooks across multi-rack topologies.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-10 border-t border-white/10 flex items-center justify-between text-xs text-[#8D8D8D]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#24A148] animate-pulse" />
            <span>SYSTEMS NOMINAL · 99.99% SLA</span>
          </div>
          <span className="font-mono">US-EAST DATA CLUSTER</span>
        </div>
      </div>

      {/* Right Form Panel: Clean AWS / IBM Console Aesthetic */}
      <div className="md:w-1/2 flex items-center justify-center p-8 md:p-14">
        <div className="w-full max-w-md bg-white border border-[#E0E0E0] p-8 rounded-[4px] shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#161616]">Sign In to Operations Console</h2>
            <p className="text-xs text-[#525252] mt-1">
              Enter your enterprise directory credentials or launch Instant Demo Mode.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-[3px] bg-[#FFF1F1] border border-[#FFD7D9] text-[#DA1E28] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#161616] mb-1.5">
                Operator Email / SSO ID
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#161616]">
                  Password
                </label>
                <a href="#forgot" onClick={(e) => { e.preventDefault(); alert("Contact your enterprise directory administrator."); }} className="text-xs text-[#0F62FE] hover:underline">
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 text-xs font-medium"
            >
              {loading ? 'Authenticating...' : 'Sign In with SSO'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E0E0E0]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[#8D8D8D] font-mono">Or quick access</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemoMode}
            className="w-full btn-secondary py-2.5 text-xs font-medium flex items-center justify-center gap-2 bg-[#F4F4F4] hover:bg-[#EAEAEA]"
          >
            <Zap className="w-3.5 h-3.5 text-[#0F62FE]" />
            <span>Launch Live Demo Mode (No Login Required)</span>
          </button>

          <p className="text-[11px] text-[#8D8D8D] text-center mt-6">
            Protected by DC-Sentinel Security Protocol. Authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
