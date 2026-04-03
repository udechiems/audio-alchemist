import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { VocalToInstrument } from './pages/tools/VocalToInstrument';
import { AudioSeparation } from './pages/tools/AudioSeparation';
import { VocalInstrumentSplit } from './pages/tools/VocalInstrumentSplit';
import { VocalHarmony } from './pages/tools/VocalHarmony';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPasswordConfirm } from './pages/ResetPasswordConfirm';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GoogleOAuthProvider } from '@react-oauth/google';

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'mock-client-id'}>
      <AuthProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPasswordConfirm />} />
              
              {/* Protected Routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/tool/vocal-instrument" element={<ProtectedRoute><VocalToInstrument /></ProtectedRoute>} />
              <Route path="/tool/audio-separation" element={<ProtectedRoute><AudioSeparation /></ProtectedRoute>} />
              <Route path="/tool/vocal-split" element={<ProtectedRoute><VocalInstrumentSplit /></ProtectedRoute>} />
              <Route path="/tool/harmony-engine" element={<ProtectedRoute><VocalHarmony /></ProtectedRoute>} />
              
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
            </Routes>
          </Layout>
        </HashRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
