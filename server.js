import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { createServer as createViteServer } from 'vite';

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const upload = multer({ dest: 'uploads/' });

  // Ensure directories exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
  if (!fs.existsSync('downloads')) {
    fs.mkdirSync('downloads');
  }

  // --- PERSISTENCE LAYER ---
  const DB_FILE = path.join(__dirname, 'db.json');

  // Initialize State
  let state = {
      users: [], // { id, name, email, passwordHash, salt, googleId?, photoUrl? }
      sessions: {}, // { token: userId }
      history: [], // { ..., userId }
      cloudConfigs: {}, // { userId: { providerId: config } }
      resetTokens: {} // { token: { userId, expiresAt } }
  };

  // Load State from Disk
  if (fs.existsSync(DB_FILE)) {
      try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          const loaded = JSON.parse(raw);
          state = { ...state, ...loaded }; // Merge to ensure new fields exist
          console.log(`Loaded DB: ${state.users.length} users, ${state.history.length} history items.`);
      } catch (e) {
          console.error("Failed to load DB, starting fresh.");
      }
  }

  // Save State to Disk
  function saveDb() {
      try {
          fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
      } catch (e) {
          console.error("Failed to save DB:", e);
      }
  }

  app.use(cors());
  app.use(express.json());

  // Serve processed files statically
  app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // --- AUTH HELPERS ---
  function hashPassword(password) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
      return { salt, hash };
  }

  function verifyPassword(password, userSalt, userHash) {
      const hash = crypto.pbkdf2Sync(password, userSalt, 1000, 64, 'sha512').toString('hex');
      return hash === userHash;
  }

  // --- MIDDLEWARE ---
  const authenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
      
      const token = authHeader.replace('Bearer ', '');
      const userId = state.sessions[token];
      
      if (!userId) return res.status(401).json({ message: "Invalid session" });
      
      req.userId = userId;
      next();
  };

  // --- AUTH ROUTES ---
  app.post('/api/auth/register', (req, res) => {
      const { name, email, password } = req.body;
      
      if (state.users.find(u => u.email === email)) {
          return res.status(400).json({ message: "Email already registered" });
      }

      const { salt, hash } = hashPassword(password);
      const user = {
          id: crypto.randomUUID(),
          name,
          email,
          salt,
          hash
      };
      
      state.users.push(user);
      
      // Auto-login
      const token = crypto.randomUUID();
      state.sessions[token] = user.id;
      
      saveDb();
      
      res.json({
          user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
          token
      });
  });

  app.post('/api/auth/login', (req, res) => {
      const { email, password } = req.body;
      const user = state.users.find(u => u.email === email);
      
      if (!user || !user.hash || !verifyPassword(password, user.salt, user.hash)) {
          return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const token = crypto.randomUUID();
      state.sessions[token] = user.id;
      saveDb();
      
      res.json({
          user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
          token
      });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
      const { email } = req.body;
      const user = state.users.find(u => u.email === email);
      
      if (user) {
          const token = crypto.randomBytes(32).toString('hex');
          state.resetTokens[token] = {
              userId: user.id,
              expiresAt: Date.now() + 3600000 // 1 hour
          };
          saveDb();

          const resetLink = `${req.headers.origin || 'http://localhost:3000'}/reset-password/${token}`;
          
          // If SMTP is configured, send a real email
          if (process.env.SMTP_USER && process.env.SMTP_PASS) {
              try {
                  const transporter = nodemailer.createTransport({
                      host: process.env.SMTP_HOST || 'smtp.gmail.com',
                      port: parseInt(process.env.SMTP_PORT || '587'),
                      secure: process.env.SMTP_SECURE === 'true',
                      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                  });
                  await transporter.sendMail({
                      from: `"Audio Alchemist" <${process.env.SMTP_USER}>`,
                      to: email,
                      subject: "Password Reset Request",
                      html: `<p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour.</p>`
                  });
                  console.log(`Reset email sent to ${email}`);
              } catch (err) {
                  console.error("Failed to send email:", err);
              }
          } else {
              // Fallback for local dev without SMTP
              console.log(`\n=== PASSWORD RESET LINK FOR ${email} ===\n${resetLink}\n=======================================\n`);
          }
      }
      
      res.json({ success: true, message: "If an account with that email exists, a password reset link has been sent." });
  });

  app.post('/api/auth/reset-password/confirm', (req, res) => {
      const { token, newPassword } = req.body;
      const tokenData = state.resetTokens[token];
      
      if (!tokenData || tokenData.expiresAt < Date.now()) {
          return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      const user = state.users.find(u => u.id === tokenData.userId);
      if (!user) {
          return res.status(400).json({ message: "User not found" });
      }
      
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      
      delete state.resetTokens[token];
      saveDb();
      
      res.json({ success: true, message: "Password has been reset successfully." });
  });

  const googleClient = process.env.VITE_GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID) : null;

  // Google Auth Endpoint
  app.post('/api/auth/google', async (req, res) => {
      try {
          const { credential } = req.body;
          
          let email, name, googleId, photoUrl;

          if (credential && googleClient) {
              // Real Google OAuth Verification
              const ticket = await googleClient.verifyIdToken({
                  idToken: credential,
                  audience: process.env.VITE_GOOGLE_CLIENT_ID,
              });
              const payload = ticket.getPayload();
              email = payload.email;
              name = payload.name;
              googleId = payload.sub;
              photoUrl = payload.picture;
          } else {
              // Fallback to mock data if no credential provided (for testing without client ID)
              email = req.body.email;
              name = req.body.name;
              googleId = req.body.googleId;
              photoUrl = req.body.photoUrl;
          }
          
          if (!email) {
              return res.status(400).json({ message: "Invalid Google credential" });
          }

          // Check if user exists
          let user = state.users.find(u => u.email === email);
          
          if (!user) {
              // Register new Google User
              user = {
                  id: crypto.randomUUID(),
                  name,
                  email,
                  googleId,
                  photoUrl,
                  // No password hash for OAuth users
              };
              state.users.push(user);
          } else {
              // Link Google ID if not present
              if (!user.googleId) {
                  user.googleId = googleId;
                  user.photoUrl = photoUrl; // Update photo if changed
              }
          }

          const token = crypto.randomUUID();
          state.sessions[token] = user.id;
          saveDb();

          res.json({
              user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
              token
          });
      } catch (error) {
          console.error("Google Auth Error:", error);
          res.status(401).json({ message: "Google Authentication failed" });
      }
  });

  app.post('/api/auth/logout', (req, res) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token && state.sessions[token]) {
          delete state.sessions[token];
          saveDb();
      }
      res.json({ success: true });
  });


  // --- DATA ROUTES (PROTECTED) ---

  // Get User History
  app.get('/api/history', authenticate, (req, res) => {
      const userHistory = state.history.filter(h => h.userId === req.userId);
      res.json(userHistory);
  });

  // Save History
  app.post('/api/history', authenticate, (req, res) => {
      const item = req.body;
      const newItem = {
          ...item,
          id: item.id || crypto.randomUUID(),
          date: item.date || new Date().toLocaleDateString(),
          userId: req.userId
      };
      state.history.unshift(newItem); 
      saveDb(); 
      res.json(newItem);
  });

  // Cloud Config
  app.get('/api/cloud/config', authenticate, (req, res) => {
      const userConfig = state.cloudConfigs[req.userId] || {};
      res.json(userConfig);
  });

  app.post('/api/cloud/config', authenticate, (req, res) => {
      const { id, config } = req.body; // id is providerId (s3, gdrive, etc)
      
      if (!state.cloudConfigs[req.userId]) {
          state.cloudConfigs[req.userId] = {};
      }
      state.cloudConfigs[req.userId][id] = config;
      
      saveDb();
      res.json({ success: true });
  });

  // --- PROCESSING ROUTE (PROTECTED) ---
  app.post('/api/process', upload.single('audio'), authenticate, async (req, res) => {
    try {
      const { toolType, extraData } = req.body;
      const file = req.file;
      const parsedExtra = extraData ? JSON.parse(extraData) : {};

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      console.log(`Processing ${toolType} for user ${req.userId}`);

      const model = "gemini-2.5-flash-native-audio-preview-12-2025";
      const audioPart = fileToGenerativePart(file.path, file.mimetype || 'audio/mp3');
      
      let analysisData = null;
      let resultFiles = [];
      
      // Helper to generate a single audio track
      const generateTrack = async (prompt, suffix) => {
          try {
              const result = await ai.models.generateContent({
                  model,
                  contents: { parts: [audioPart, { text: prompt }] },
                  config: { responseModalities: [Modality.AUDIO] }
              });
              
              const part = result.candidates?.[0]?.content?.parts?.[0];
              if (part && part.inlineData && part.inlineData.data) {
                  const rawPcm = Buffer.from(part.inlineData.data, 'base64');
                  const header = writeWavHeader(24000, 1, 16, rawPcm.length);
                  const buffer = Buffer.concat([header, rawPcm]);
                  
                  const filename = `processed_${suffix}_${Date.now()}.wav`;
                  const outputPath = path.join(__dirname, 'downloads', filename);
                  fs.writeFileSync(outputPath, buffer);
                  
                  return {
                      name: suffix,
                      url: `/downloads/${filename}`
                  };
              }
          } catch (e) {
              console.error(`Failed to generate ${suffix}:`, e.message);
          }
          return null;
      };

      try {
          if (toolType === 'Vocal → Instrument') {
               const analyzePrompt = "Analyze this audio. Provide key, pitch, bpm, mood, and vocal octave in JSON.";
               const analysisRes = await ai.models.generateContent({
                  model,
                  contents: { parts: [audioPart, { text: analyzePrompt }] },
                  config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, pitch: { type: Type.STRING }, bpm: { type: Type.STRING }, mood: { type: Type.STRING }, octave: { type: Type.INTEGER } } } }
               });
               if (analysisRes.text) analysisData = JSON.parse(analysisRes.text);

               const instrument = parsedExtra.instrument || "Piano";
               const track = await generateTrack(`Generate a ${instrument} track playing this exact melody.`, instrument);
               if (track) resultFiles.push(track);

          } else if (toolType === 'Harmony Engine') {
               const analyzePrompt = "Analyze the key, pitch, bpm, and mood of this vocal.";
               const analysisRes = await ai.models.generateContent({
                  model,
                  contents: { parts: [audioPart, { text: analyzePrompt }] },
                  config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, pitch: { type: Type.STRING }, bpm: { type: Type.STRING }, mood: { type: Type.STRING }, octave: { type: Type.INTEGER } } } }
               });
               if (analysisRes.text) analysisData = JSON.parse(analysisRes.text);

               const voices = parsedExtra.voices || {};
               const arrangement = Object.entries(voices)
                  .filter(([_, count]) => count > 0)
                  .map(([type, count]) => `${count} ${type}`)
                  .join(', ');
               const harmonyPrompt = arrangement 
                  ? `Generate a vocal harmony backing track with this specific arrangement: ${arrangement}. Only output the harmony vocals.`
                  : "Generate a 3-part vocal harmony backing track. Only output the harmony vocals.";
               const track = await generateTrack(harmonyPrompt, "harmony");
               if (track) resultFiles.push(track);

          } else if (toolType === 'Audio Separation') {
              const stems = [
                  { name: 'Vocals', prompt: 'Generate audio containing ONLY the vocals from this track.' },
                  { name: 'Bass', prompt: 'Generate audio containing ONLY the bass line from this track.' },
                  { name: 'Drums', prompt: 'Generate audio containing ONLY the drums and percussion from this track.' },
                  { name: 'Other', prompt: 'Generate audio containing the instrumental melody (no vocals, bass, or drums) from this track.' }
              ];
              const results = await Promise.all(stems.map(s => generateTrack(s.prompt, s.name)));
              resultFiles = results.filter(r => r !== null);

          } else if (toolType === 'Vocal & Instrument Split') {
              const stems = [
                  { name: 'Vocals', prompt: 'Generate audio containing ONLY the vocals from this track. Remove all instruments.' },
                  { name: 'Instrumental', prompt: 'Generate audio containing ONLY the instruments from this track. Remove all vocals.' }
              ];
              const results = await Promise.all(stems.map(s => generateTrack(s.prompt, s.name)));
              resultFiles = results.filter(r => r !== null);
          }
      } catch (error) {
          console.error("Gemini Generation Failed:", error);
      }

      // Clean up input
      try { fs.unlinkSync(file.path); } catch (e) {}

      // Response
      const mainDownloadUrl = resultFiles.length > 0 ? resultFiles[0].url : '#';
      
      res.json({
        success: true,
        message: `Successfully processed ${file.originalname}`,
        analysis: analysisData,
        downloadUrl: mainDownloadUrl,
        files: resultFiles
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Server error during processing' });
    }
  });

  // --- WAV HEADER HELPER ---
  function writeWavHeader(sampleRate, numChannels, bitsPerSample, dataLength) {
      const buffer = Buffer.alloc(44);
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + dataLength, 4);
      buffer.write('WAVE', 8);
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20);
      buffer.writeUInt16LE(numChannels, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
      buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
      buffer.writeUInt16LE(bitsPerSample, 34);
      buffer.write('data', 36);
      buffer.writeUInt32LE(dataLength, 40);
      return buffer;
  }

  function fileToGenerativePart(path, mimeType) {
    return {
      inlineData: {
        data: fs.readFileSync(path).toString("base64"),
        mimeType
      },
    };
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();