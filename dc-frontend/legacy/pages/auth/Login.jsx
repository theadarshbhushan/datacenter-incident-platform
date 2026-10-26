import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Server } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('admin@datacenter.ai');
  const [password, setPassword] = useState('password123');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('dc_token', data.access_token);
        localStorage.setItem('dc_user', JSON.stringify({ name: 'Adarsh', email, role: 'Admin' }));
      } else throw new Error('invalid');
    } catch {
      // Demo fallback
      if (email && password.length >= 6) {
        localStorage.setItem('dc_token', 'demo_token_' + Date.now());
        localStorage.setItem('dc_user', JSON.stringify({ name: 'Adarsh', email, role: 'Admin' }));
      } else { setLoading(false); setError('Invalid email or password'); return; }
    }
    setLoading(false);
    navigate('/app/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F8FAF8] flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 bg-green-700 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Server size={18} className="text-white" /></div>
          <span className="text-white font-bold text-lg">DataCenterAI</span>
        </div>
        <div>
          <h2 className="text-white text-3xl font-bold mb-4">Predict failures before they happen</h2>
          <p className="text-green-200 text-sm leading-relaxed">AI-powered incident management and predictive monitoring for modern data centers.</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[['87.8%','Anomaly Accuracy'],['6.77%','LSTM MAE'],['23m','Avg MTTR'],['99.7%','Uptime SLA']].map(([v,l])=>(
              <div key={l} className="bg-white/10 rounded-xl p-4">
                <div className="text-white text-2xl font-bold">{v}</div>
                <div className="text-green-200 text-xs mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-green-300 text-xs">© 2026 DataCenterAI. Enterprise Infrastructure Intelligence.</p>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center"><Server size={18} className="text-white" /></div>
            <span className="font-bold text-gray-900">DataCenterAI</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-8">Welcome back to your NOC dashboard</p>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email address</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@company.ai" />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-green-700 hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input className="input pr-10" type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
                <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{show?<EyeOff size={15}/>:<Eye size={15}/>}</button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            Don't have an account? <Link to="/signup" className="text-green-700 font-medium hover:underline">Create account</Link>
          </div>
          <div className="mt-6 p-3 bg-green-50 rounded-lg text-xs text-green-800 text-center">
            Demo: use any email + password (6+ chars)
          </div>
        </div>
      </div>
    </div>
  );
}
